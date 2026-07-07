import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24

const CLOSED_STAGES_TUPLE = '("Complete","Completed","Claim Denied")'

const CLOSED_STAGES_ARRAY = ['Complete', 'Completed', 'Claim Denied']

// ── helpers ────────────────────────────────────────────────────────────────────

function normalizePipeline(tankType: string | null | undefined): string {
  if (tankType === 'AST') return 'AST'
  if (tankType === 'UST') return 'UST'
  return 'Other'
}

// Monday-anchored ISO week string (YYYY-MM-DD of the Monday)
function isoWeek(isoStr: string): string {
  const d = new Date(isoStr)
  const day = d.getUTCDay() // 0 = Sun
  const toMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + toMonday)
  return monday.toISOString().slice(0, 10)
}

// PERCENTILE_CONT equivalent in JS — input must be pre-sorted ascending
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = q * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + (sorted[hi] ?? sorted[lo]) * frac
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

type SB = ReturnType<typeof getServerSupabase>

// ── VIEW 1: dwell ──────────────────────────────────────────────────────────────
// Per-stage median and p90 dwell times, using completed transitions only.

async function viewDwell(sb: SB) {
  const [eventsRes, claimsRes] = await Promise.all([
    sb
      .from('claim_events')
      .select('stage, days_in_stage, claim_id')
      .not('days_in_stage', 'is', null)
      .not('stage', 'in', CLOSED_STAGES_TUPLE),
    sb
      .from('claims')
      .select('id, tank_type'),
  ])

  if (eventsRes.error) throw new Error(eventsRes.error.message)
  if (claimsRes.error) throw new Error(claimsRes.error.message)

  const pipelineByClaimId: Record<string, string> = {}
  for (const c of claimsRes.data ?? []) {
    pipelineByClaimId[c.id] = normalizePipeline(c.tank_type)
  }

  // Bucket raw days values by stage||pipeline key
  const agg: Record<string, number[]> = {}
  for (const ev of eventsRes.data ?? []) {
    const pipeline = pipelineByClaimId[ev.claim_id] ?? 'Other'
    const key = `${ev.stage ?? 'Unknown'}||${pipeline}`
    if (!agg[key]) agg[key] = []
    agg[key].push(ev.days_in_stage as number)
  }

  const rows = Object.keys(agg).map((key) => {
    const parts = key.split('||')
    const stage = parts[0]
    const pipeline = parts[1] ?? 'Other'
    const sorted = agg[key].slice().sort((a, b) => a - b)
    return {
      stage,
      pipeline,
      claim_count: sorted.length,
      median_days: round1(quantile(sorted, 0.5)),
      p90_days: round1(quantile(sorted, 0.9)),
    }
  })

  rows.sort((a, b) => b.median_days - a.median_days)
  return rows
}

// ── VIEW 2: volume ─────────────────────────────────────────────────────────────
// Weekly opened and closed claim counts by pipeline, last 52 weeks.

async function viewVolume(sb: SB) {
  const cutoff = new Date(Date.now() - 52 * 7 * MS_PER_DAY).toISOString()

  const [openedRes, closedEventsRes, claimsForPipelineRes] = await Promise.all([
    // Claims created in last 52 weeks (Claim type only)
    sb
      .from('claims')
      .select('created_time, tank_type')
      .gte('created_time', cutoff)
      .eq('record_type', 'Claim')
      .not('created_time', 'is', null),

    // Terminal stage transitions in last 52 weeks
    sb
      .from('claim_events')
      .select('entered_at, claim_id')
      .in('stage', CLOSED_STAGES_ARRAY)
      .gte('entered_at', cutoff)
      .not('entered_at', 'is', null),

    // Full pipeline lookup for the closed-events join
    sb
      .from('claims')
      .select('id, tank_type'),
  ])

  if (openedRes.error) throw new Error(openedRes.error.message)
  if (closedEventsRes.error) throw new Error(closedEventsRes.error.message)
  if (claimsForPipelineRes.error) throw new Error(claimsForPipelineRes.error.message)

  const pipelineByClaimId: Record<string, string> = {}
  for (const c of claimsForPipelineRes.data ?? []) {
    pipelineByClaimId[c.id] = normalizePipeline(c.tank_type)
  }

  // Opened: bucket by ISO week + pipeline
  const openedAgg: Record<string, number> = {}
  for (const c of openedRes.data ?? []) {
    const key = `${isoWeek(c.created_time)}||${normalizePipeline(c.tank_type)}`
    openedAgg[key] = (openedAgg[key] ?? 0) + 1
  }

  // Closed: deduplicate by claim_id within each week||pipeline bucket
  // (a claim can have multiple terminal events; count it once per week)
  const closedAgg: Record<string, Record<string, true>> = {}
  for (const ev of closedEventsRes.data ?? []) {
    const pipeline = pipelineByClaimId[ev.claim_id] ?? 'Other'
    const key = `${isoWeek(ev.entered_at)}||${pipeline}`
    if (!closedAgg[key]) closedAgg[key] = {}
    closedAgg[key][ev.claim_id] = true
  }

  const opened = Object.keys(openedAgg)
    .map((key) => {
      const parts = key.split('||')
      return { week: parts[0], pipeline: parts[1] ?? 'Other', count: openedAgg[key] }
    })
    .sort((a, b) => a.week.localeCompare(b.week))

  const closed = Object.keys(closedAgg)
    .map((key) => {
      const parts = key.split('||')
      return {
        week: parts[0],
        pipeline: parts[1] ?? 'Other',
        count: Object.keys(closedAgg[key]).length,
      }
    })
    .sort((a, b) => a.week.localeCompare(b.week))

  return { opened, closed }
}

// ── VIEW 3: bottleneck ─────────────────────────────────────────────────────────
// For each stage + pipeline, average days currently open claims have been
// sitting in that stage (now - stage entered_at, or fallback to modified_time).

async function viewBottleneck(sb: SB) {
  const [claimsRes, eventsRes] = await Promise.all([
    sb
      .from('claims')
      .select('id, stage, tank_type, modified_time')
      .eq('record_type', 'Claim')
      .not('stage', 'in', CLOSED_STAGES_TUPLE),
    // Fetch all events — avoids long IN(...) param with 900+ claim IDs
    sb
      .from('claim_events')
      .select('claim_id, stage, entered_at')
      .not('entered_at', 'is', null),
  ])

  if (claimsRes.error) throw new Error(claimsRes.error.message)
  if (eventsRes.error) throw new Error(eventsRes.error.message)

  // Build lookup: "claimId||stage" → most recent entered_at
  const latestEntered: Record<string, string> = {}
  for (const ev of eventsRes.data ?? []) {
    const key = `${ev.claim_id}||${ev.stage}`
    const prev = latestEntered[key]
    if (!prev || ev.entered_at > prev) {
      latestEntered[key] = ev.entered_at
    }
  }

  const now = Date.now()

  // Aggregate dwell days per stage||pipeline bucket
  const agg: Record<string, { days: number[]; pipeline: string }> = {}
  for (const claim of claimsRes.data ?? []) {
    if (!claim.stage) continue
    const pipeline = normalizePipeline(claim.tank_type)
    const key = `${claim.stage}||${pipeline}`

    const enteredAt = latestEntered[`${claim.id}||${claim.stage}`] ?? claim.modified_time
    const days = enteredAt ? (now - new Date(enteredAt).getTime()) / MS_PER_DAY : 0

    if (!agg[key]) agg[key] = { days: [], pipeline }
    agg[key].days.push(days)
  }

  const rows = Object.keys(agg).map((key) => {
    const parts = key.split('||')
    const stage = parts[0]
    const { days, pipeline } = agg[key]
    const avg = days.reduce((a, b) => a + b, 0) / days.length
    return {
      stage,
      pipeline,
      claim_count: days.length,
      avg_days_in_stage: round1(avg),
    }
  })

  rows.sort((a, b) => b.avg_days_in_stage - a.avg_days_in_stage)
  return rows
}

// ── VIEW 4: stale ──────────────────────────────────────────────────────────────
// Open claims bucketed by days since last modified, grouped by pipeline.

type StaleBucket = '14-21d' | '21-30d' | '30-60d' | '60d+'
const BUCKET_ORDER: StaleBucket[] = ['14-21d', '21-30d', '30-60d', '60d+']

async function viewStale(sb: SB) {
  const { data: openClaims, error } = await sb
    .from('claims')
    .select('tank_type, modified_time')
    .eq('record_type', 'Claim')
    .not('stage', 'in', CLOSED_STAGES_TUPLE)
    .not('modified_time', 'is', null)

  if (error) throw new Error(error.message)

  const now = Date.now()
  const agg: Record<string, number> = {}

  for (const claim of openClaims ?? []) {
    const days = (now - new Date(claim.modified_time).getTime()) / MS_PER_DAY
    if (days <= 14) continue

    let bucket: StaleBucket
    if (days <= 21) bucket = '14-21d'
    else if (days <= 30) bucket = '21-30d'
    else if (days <= 60) bucket = '30-60d'
    else bucket = '60d+'

    const key = `${normalizePipeline(claim.tank_type)}||${bucket}`
    agg[key] = (agg[key] ?? 0) + 1
  }

  const rows = Object.keys(agg)
    .map((key) => {
      const parts = key.split('||')
      return {
        pipeline: parts[0],
        bucket: parts[1] as StaleBucket,
        count: agg[key],
      }
    })
    .sort((a, b) => {
      const pi = BUCKET_ORDER.indexOf(a.bucket)
      const qi = BUCKET_ORDER.indexOf(b.bucket)
      if (pi !== qi) return pi - qi
      return a.pipeline.localeCompare(b.pipeline)
    })

  return rows
}

// ── route handler ──────────────────────────────────────────────────────────────

const VALID_VIEWS = ['dwell', 'volume', 'bottleneck', 'stale'] as const
type View = (typeof VALID_VIEWS)[number]

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const view = req.nextUrl.searchParams.get('view') as View | null
  if (!view || !(VALID_VIEWS as readonly string[]).includes(view)) {
    return NextResponse.json(
      { error: `Missing or invalid ?view= param. Valid values: ${VALID_VIEWS.join(', ')}` },
      { status: 400 },
    )
  }

  const sb = getServerSupabase()

  try {
    let data: unknown
    switch (view) {
      case 'dwell':      data = await viewDwell(sb);      break
      case 'volume':     data = await viewVolume(sb);     break
      case 'bottleneck': data = await viewBottleneck(sb); break
      case 'stale':      data = await viewStale(sb);      break
    }
    return NextResponse.json({ view, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
