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
// Optional pipelineFilter ('AST' | 'UST') restricts to that pipeline only.

async function viewDwell(sb: SB, pipelineFilter?: string) {
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
    if (pipelineFilter && pipeline !== pipelineFilter) continue
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

// ── VIEW 5: financial ──────────────────────────────────────────────────────────
// Financial exposure overview: estimates and payments aggregated by pipeline.
// estimates table uses estimate_total as the top-level amount; subtotals
// (contractor_costs, state_fees, adjuster_fees) are also present and included.
// claim_payments table uses the `amount` column.

async function viewFinancial(sb: SB) {
  const [estimatesRes, paymentsRes, claimsRes] = await Promise.all([
    sb
      .from('estimates')
      .select('claim_id, estimate_total, contractor_costs, state_fees, adjuster_fees')
      .not('claim_id', 'is', null),
    sb
      .from('claim_payments')
      .select('claim_id, amount')
      .not('claim_id', 'is', null),
    sb
      .from('claims')
      .select('id, tank_type'),
  ])

  if (estimatesRes.error) throw new Error(estimatesRes.error.message)
  if (paymentsRes.error) throw new Error(paymentsRes.error.message)
  if (claimsRes.error) throw new Error(claimsRes.error.message)

  const pipelineByClaimId: Record<string, string> = {}
  for (const c of claimsRes.data ?? []) {
    pipelineByClaimId[c.id] = normalizePipeline(c.tank_type)
  }

  // Estimates aggregation — one claim can have multiple estimates (one per FS record)
  type EstAgg = {
    claimsSet: Record<string, true>
    total_estimated: number
    total_contractor_costs: number
    total_state_fees: number
    total_adjuster_fees: number
  }
  const estAgg: Record<string, EstAgg> = {}

  for (const e of estimatesRes.data ?? []) {
    const pipeline = pipelineByClaimId[e.claim_id ?? ''] ?? 'Other'
    if (!estAgg[pipeline]) {
      estAgg[pipeline] = {
        claimsSet: {},
        total_estimated: 0,
        total_contractor_costs: 0,
        total_state_fees: 0,
        total_adjuster_fees: 0,
      }
    }
    if (e.claim_id) estAgg[pipeline].claimsSet[e.claim_id] = true
    estAgg[pipeline].total_estimated      += (e.estimate_total     as number) ?? 0
    estAgg[pipeline].total_contractor_costs += (e.contractor_costs as number) ?? 0
    estAgg[pipeline].total_state_fees     += (e.state_fees         as number) ?? 0
    estAgg[pipeline].total_adjuster_fees  += (e.adjuster_fees      as number) ?? 0
  }

  const estimates = Object.keys(estAgg).map((pipeline) => {
    const a = estAgg[pipeline]
    const claimsCount = Object.keys(a.claimsSet).length
    return {
      pipeline,
      claims_with_estimates: claimsCount,
      total_estimated: round1(a.total_estimated),
      avg_per_claim: round1(claimsCount > 0 ? a.total_estimated / claimsCount : 0),
      total_contractor_costs: round1(a.total_contractor_costs),
      total_state_fees: round1(a.total_state_fees),
      total_adjuster_fees: round1(a.total_adjuster_fees),
    }
  })

  // Payments aggregation
  type PmtAgg = { claimsSet: Record<string, true>; total_paid: number }
  const pmtAgg: Record<string, PmtAgg> = {}

  for (const p of paymentsRes.data ?? []) {
    const pipeline = pipelineByClaimId[p.claim_id ?? ''] ?? 'Other'
    if (!pmtAgg[pipeline]) pmtAgg[pipeline] = { claimsSet: {}, total_paid: 0 }
    if (p.claim_id) pmtAgg[pipeline].claimsSet[p.claim_id] = true
    pmtAgg[pipeline].total_paid += (p.amount as number) ?? 0
  }

  const payments = Object.keys(pmtAgg).map((pipeline) => ({
    pipeline,
    claims_with_payments: Object.keys(pmtAgg[pipeline].claimsSet).length,
    total_paid: round1(pmtAgg[pipeline].total_paid),
  }))

  // Cross-pipeline totals
  const total_estimated = estimates.reduce((s, r) => s + r.total_estimated, 0)
  const total_paid      = payments.reduce((s, r) => s + r.total_paid, 0)
  const collection_rate_pct =
    total_estimated > 0 ? round1((total_paid / total_estimated) * 100) : 0

  return {
    estimates,
    payments,
    totals: {
      total_estimated: round1(total_estimated),
      total_paid:      round1(total_paid),
      collection_rate_pct,
    },
  }
}

// ── VIEW 6: agents ─────────────────────────────────────────────────────────────
// Agent workload board: open claims per owner with staleness metrics.

async function viewAgents(sb: SB) {
  const { data: claims, error } = await sb
    .from('claims')
    .select('owner_name, tank_type, modified_time')
    .eq('record_type', 'Claim')
    .not('stage', 'in', CLOSED_STAGES_TUPLE)
    .not('modified_time', 'is', null)

  if (error) throw new Error(error.message)

  const now = Date.now()

  type AgentAgg = {
    total_open: number
    stale_count: number
    oldest_days: number
    ast_open: number
    ust_open: number
  }
  const agg: Record<string, AgentAgg> = {}

  for (const claim of claims ?? []) {
    const name = claim.owner_name?.trim()
    if (!name) continue

    const days = (now - new Date(claim.modified_time).getTime()) / MS_PER_DAY

    if (!agg[name]) {
      agg[name] = { total_open: 0, stale_count: 0, oldest_days: 0, ast_open: 0, ust_open: 0 }
    }
    agg[name].total_open++
    if (days > 14) agg[name].stale_count++
    if (days > agg[name].oldest_days) agg[name].oldest_days = days
    if (claim.tank_type === 'AST') agg[name].ast_open++
    if (claim.tank_type === 'UST') agg[name].ust_open++
  }

  const rows = Object.keys(agg).map((name) => {
    const a = agg[name]
    return {
      agent_name: name,
      total_open: a.total_open,
      stale_count: a.stale_count,
      stale_pct: Math.round((a.stale_count / a.total_open) * 100),
      oldest_claim_days: round1(a.oldest_days),
      ast_open: a.ast_open,
      ust_open: a.ust_open,
    }
  })

  rows.sort((a, b) => {
    if (b.stale_count !== a.stale_count) return b.stale_count - a.stale_count
    return b.total_open - a.total_open
  })

  return rows
}

// ── VIEW 7: denials ────────────────────────────────────────────────────────────
// Denial rate trend (monthly, last 18 months) + all-time reason breakdown.
// Uses modified_time for monthly bucketing — reflects when the claim was denied,
// not when it was first reported (created_time).
// claim_denied is a boolean written by syncClaims as (Claim_Denied === true).
// Fallback: stage = 'Claim Denied' also counts as denied.

async function viewDenials(sb: SB) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 18)

  const [closedRes, reasonsRes] = await Promise.all([
    sb
      .from('claims')
      .select('stage, claim_denied, modified_time')
      .eq('record_type', 'Claim')
      .in('stage', CLOSED_STAGES_ARRAY)
      .gte('modified_time', cutoff.toISOString())
      .not('modified_time', 'is', null),
    sb
      .from('claims')
      .select('claim_denied_reason')
      .eq('claim_denied', true)
      .not('claim_denied_reason', 'is', null),
  ])

  if (closedRes.error) throw new Error(closedRes.error.message)
  if (reasonsRes.error) throw new Error(reasonsRes.error.message)

  // Monthly trend
  const monthAgg: Record<string, { total_closed: number; denied: number }> = {}
  for (const claim of closedRes.data ?? []) {
    const month = (claim.modified_time as string).slice(0, 7) // YYYY-MM
    if (!monthAgg[month]) monthAgg[month] = { total_closed: 0, denied: 0 }
    monthAgg[month].total_closed++
    if (claim.claim_denied === true || claim.stage === 'Claim Denied') {
      monthAgg[month].denied++
    }
  }

  const trend = Object.keys(monthAgg)
    .sort()
    .map((month) => {
      const { total_closed, denied } = monthAgg[month]
      return {
        month,
        total_closed,
        denied,
        denial_rate_pct:
          total_closed > 0 ? round1((denied / total_closed) * 100) : 0,
      }
    })

  // All-time reason breakdown (aggregate in JS to avoid GROUP BY limitations)
  const reasonAgg: Record<string, number> = {}
  for (const r of reasonsRes.data ?? []) {
    const reason = r.claim_denied_reason as string
    reasonAgg[reason] = (reasonAgg[reason] ?? 0) + 1
  }

  const reasons = Object.keys(reasonAgg)
    .map((reason) => ({ claim_denied_reason: reason, count: reasonAgg[reason] }))
    .sort((a, b) => b.count - a.count)

  return { trend, reasons }
}

// ── route handler ──────────────────────────────────────────────────────────────

const VALID_VIEWS = [
  'dwell', 'volume', 'bottleneck', 'stale', 'financial', 'agents', 'denials',
] as const
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
      case 'dwell': {
        const pipelineFilter = req.nextUrl.searchParams.get('pipeline') ?? undefined
        data = await viewDwell(sb, pipelineFilter)
        break
      }
      case 'volume':     data = await viewVolume(sb);     break
      case 'bottleneck': data = await viewBottleneck(sb); break
      case 'stale':      data = await viewStale(sb);      break
      case 'financial':  data = await viewFinancial(sb);  break
      case 'agents':     data = await viewAgents(sb);     break
      case 'denials':    data = await viewDenials(sb);    break
    }
    return NextResponse.json({ view, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
