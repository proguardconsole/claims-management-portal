import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'
import { fetchAllRows } from '../../../lib/supabase/fetchAll'
import { cronAuthOk } from '../../../lib/secureCompare'

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
    fetchAllRows((f, t) => sb
      .from('claim_events')
      .select('stage, days_in_stage, claim_id')
      .not('days_in_stage', 'is', null)
      .not('stage', 'in', CLOSED_STAGES_TUPLE)
      .order('id').range(f, t)),
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('id, tank_type')
      .not('owner_name', 'ilike', '%admin%')
      .order('id').range(f, t)),
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
    // Drop events for claims outside the admin-filtered claims map
    const pipeline = pipelineByClaimId[ev.claim_id]
    if (!pipeline) continue
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
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('created_time, tank_type')
      .gte('created_time', cutoff)
      .eq('record_type', 'Claim')
      .not('owner_name', 'ilike', '%admin%')
      .not('created_time', 'is', null)
      .order('id').range(f, t)),

    // Terminal stage transitions in last 52 weeks
    fetchAllRows((f, t) => sb
      .from('claim_events')
      .select('entered_at, claim_id')
      .in('stage', CLOSED_STAGES_ARRAY)
      .gte('entered_at', cutoff)
      .not('entered_at', 'is', null)
      .order('id').range(f, t)),

    // Full pipeline lookup for the closed-events join
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('id, tank_type')
      .not('owner_name', 'ilike', '%admin%')
      .order('id').range(f, t)),
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
    // Drop events for claims outside the admin-filtered claims map
    const pipeline = pipelineByClaimId[ev.claim_id]
    if (!pipeline) continue
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
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('id, stage, tank_type, modified_time')
      .eq('record_type', 'Claim')
      .not('owner_name', 'ilike', '%admin%')
      .not('stage', 'in', CLOSED_STAGES_TUPLE)
      .order('id').range(f, t)),
    // Fetch all events — avoids long IN(...) param with 900+ claim IDs
    fetchAllRows((f, t) => sb
      .from('claim_events')
      .select('claim_id, stage, entered_at')
      .not('entered_at', 'is', null)
      .order('id').range(f, t)),
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
  const { data: openClaims, error } = await fetchAllRows((f, t) => sb
    .from('claims')
    .select('tank_type, modified_time')
    .eq('record_type', 'Claim')
    .not('owner_name', 'ilike', '%admin%')
    .not('stage', 'in', CLOSED_STAGES_TUPLE)
    .not('modified_time', 'is', null)
    .order('id').range(f, t))

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
// Financial exposure overview scoped to open claims only (ast_open + ust_open).
// Answers: what are we exposed to right now?

async function viewFinancial(sb: SB) {
  // Step 1 — fetch open claims to get the scoping IDs
  const { data: openClaims, error: claimsErr } = await sb
    .from('claims')
    .select('id, tank_type')
    .in('claim_status', ['ast_open', 'ust_open'])
    .not('owner_name', 'ilike', '%admin%')

  if (claimsErr) throw new Error(claimsErr.message)

  const openClaimIds = (openClaims ?? []).map((c) => c.id)

  if (openClaimIds.length === 0) {
    return {
      totals: {
        total_estimated: 0, total_paid_out: 0, remaining_exposure: 0,
        from_carrier: 0, to_contractor: 0, to_customer: 0, to_provider: 0,
        received_to_date: 0, open_claim_count: 0,
      },
      by_pipeline: [],
    }
  }

  // Step 2 — fetch estimates and payments scoped to those IDs
  const [estimatesRes, paymentsRes] = await Promise.all([
    sb
      .from('estimates')
      .select('claim_id, estimate_total')
      .in('claim_id', openClaimIds),
    sb
      .from('claim_payments')
      .select('claim_id, amount, payment_type, incoming_or_outgoing, account_name, related_type')
      .in('claim_id', openClaimIds),
  ])

  if (estimatesRes.error) throw new Error(estimatesRes.error.message)
  if (paymentsRes.error) throw new Error(paymentsRes.error.message)

  const pipelineByClaimId: Record<string, string> = {}
  for (const c of openClaims ?? []) {
    pipelineByClaimId[c.id] = normalizePipeline(c.tank_type)
  }

  // Aggregate estimates per claim (MAX estimate_total per claim_id across rows)
  const maxEstByClaimId: Record<string, number> = {}
  for (const e of estimatesRes.data ?? []) {
    const cid = e.claim_id as string | null
    if (!cid) continue
    const et = (e.estimate_total as number | null) ?? 0
    maxEstByClaimId[cid] = Math.max(maxEstByClaimId[cid] ?? 0, et)
  }

  // Per-pipeline estimate aggregation
  type PipelineAgg = {
    claim_count: number
    total_estimated: number
    total_paid_out: number
  }
  const pipelineAgg: Record<string, PipelineAgg> = {}

  for (const c of openClaims ?? []) {
    const pl = normalizePipeline(c.tank_type)
    if (!pipelineAgg[pl]) pipelineAgg[pl] = { claim_count: 0, total_estimated: 0, total_paid_out: 0 }
    pipelineAgg[pl].claim_count++
    pipelineAgg[pl].total_estimated += maxEstByClaimId[c.id] ?? 0
  }

  // Payment aggregation — apply same filter rules as KPI route
  let total_paid_out    = 0
  let from_carrier      = 0
  let to_contractor     = 0
  let to_customer       = 0
  let to_provider       = 0
  let received_to_date  = 0

  for (const p of paymentsRes.data ?? []) {
    const cid  = p.claim_id as string | null
    const amt  = (p.amount as number | null) ?? 0
    const io   = p.incoming_or_outgoing as string | null
    const pt   = p.payment_type as string | null
    const acct = p.account_name as string | null
    const rt   = p.related_type as string | null

    const isClaimPayout = pt === 'Claim Payout'
    const isOutgoing    = io === 'Outgoing'
    const isIncoming    = io === 'Incoming'
    const isAdjRow      = acct === 'Claim Adjusters'
    const isCarrierRow  = acct === 'Claim Adjusters - Recoverable from Carrier'

    if (isClaimPayout && isOutgoing && !isAdjRow) {
      total_paid_out += amt
      if (cid) pipelineAgg[pipelineByClaimId[cid] ?? 'Other'].total_paid_out += amt
    }
    if (isClaimPayout && isOutgoing && isCarrierRow) from_carrier   += amt
    if (isClaimPayout && isOutgoing && rt === 'Contractor' && !isAdjRow && !isCarrierRow) to_contractor += amt
    if (isClaimPayout && isOutgoing && rt === 'Policy Holder') to_customer   += amt
    if (isClaimPayout && isOutgoing && rt === 'Provider')      to_provider   += amt
    if (isIncoming) received_to_date += amt
  }

  const total_estimated    = Object.values(maxEstByClaimId).reduce((s, v) => s + v, 0)
  const remaining_exposure = total_estimated - total_paid_out

  const by_pipeline = Object.entries(pipelineAgg)
    .filter(([pl]) => pl === 'AST' || pl === 'UST')
    .map(([pl, a]) => ({
      pipeline:           pl,
      tank_type:          pl,
      claim_count:        a.claim_count,
      total_estimated:    round1(a.total_estimated),
      total_paid_out:     round1(a.total_paid_out),
      remaining_exposure: round1(a.total_estimated - a.total_paid_out),
    }))
    .sort((a, b) => a.pipeline.localeCompare(b.pipeline))

  return {
    totals: {
      total_estimated:    round1(total_estimated),
      total_paid_out:     round1(total_paid_out),
      remaining_exposure: round1(remaining_exposure),
      from_carrier:       round1(from_carrier),
      to_contractor:      round1(to_contractor),
      to_customer:        round1(to_customer),
      to_provider:        round1(to_provider),
      received_to_date:   round1(received_to_date),
      open_claim_count:   openClaimIds.length,
    },
    by_pipeline,
  }
}

// ── VIEW 6: agents ─────────────────────────────────────────────────────────────
// Agent workload board: open claims per owner with staleness metrics.

async function viewAgents(sb: SB) {
  const { data: claims, error } = await fetchAllRows((f, t) => sb
    .from('claims')
    .select('owner_name, tank_type, modified_time')
    .eq('record_type', 'Claim')
    .not('stage', 'in', CLOSED_STAGES_TUPLE)
    .not('modified_time', 'is', null)
    .not('owner_name', 'ilike', '%admin%')
    .order('id').range(f, t))

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
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('stage, modified_time')
      .eq('record_type', 'Claim')
      .in('stage', CLOSED_STAGES_ARRAY)
      .gte('modified_time', cutoff.toISOString())
      .not('modified_time', 'is', null)
      .not('owner_name', 'ilike', '%admin%')
      .order('id').range(f, t)),
    fetchAllRows((f, t) => sb
      .from('claims')
      .select('claim_denied_reason')
      .eq('stage', 'Claim Denied')
      .not('owner_name', 'ilike', '%admin%')
      .not('claim_denied_reason', 'is', null)
      .order('id').range(f, t)),
  ])

  if (closedRes.error) throw new Error(closedRes.error.message)
  if (reasonsRes.error) throw new Error(reasonsRes.error.message)

  // Monthly trend
  const monthAgg: Record<string, { total_closed: number; denied: number }> = {}
  for (const claim of closedRes.data ?? []) {
    const month = (claim.modified_time as string).slice(0, 7) // YYYY-MM
    if (!monthAgg[month]) monthAgg[month] = { total_closed: 0, denied: 0 }
    monthAgg[month].total_closed++
    if (claim.stage === 'Claim Denied') {
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
  if (!cronAuthOk(req.headers.get('Authorization'))) {
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
