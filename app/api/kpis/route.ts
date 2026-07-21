import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ['ast_open', 'ust_open', 'ust_pre_tank'] as const
const TERMINAL_STAGES = ['Complete', 'Completed', 'Claim Denied'] as const
const MS_PER_DAY = 1000 * 60 * 60 * 24
const OVERDUE_DAYS = 14

type Period = 'week' | 'month' | 'quarter' | 'year'

const PERIOD_DAYS: Record<Period, number> = {
  week:    7,
  month:   30,
  quarter: 90,
  year:    365,
}

// ── helpers ────────────────────────────────────────────────────────────────────

function sinceFromPeriod(period: Period): string {
  return new Date(Date.now() - PERIOD_DAYS[period] * MS_PER_DAY).toISOString()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ── route ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawPeriod = req.nextUrl.searchParams.get('period') ?? 'month'
  const period: Period =
    rawPeriod in PERIOD_DAYS ? (rawPeriod as Period) : 'month'
  const since = sinceFromPeriod(period)
  const overdueThreshold = new Date(
    Date.now() - OVERDUE_DAYS * MS_PER_DAY,
  ).toISOString()

  const sb = getServerSupabase()

  // ── Wave 1: four parallel fetches ─────────────────────────────────────────────

  const [openClaimsRes, terminalEventsRes, openedCountRes, bottleneckEventsRes, allEstimatesRes] = await Promise.all([
    // All currently open claims — drives open/overdue/avgDaysOpen + pipeline/recent/age/coverage breakdowns
    sb
      .from('claims')
      .select(
        'id, field_service_number, claim_status, owner_name, tank_type, stage, modified_time, date_claim_is_reported, created_time, deductible_paid',
      )
      .in('claim_status', [...OPEN_STATUSES])
      .not('modified_time', 'is', null),

    // Terminal stage transitions within the period — drives closed/denied/avgDaysToClose
    sb
      .from('claim_events')
      .select('claim_id, stage, entered_at')
      .in('stage', [...TERMINAL_STAGES])
      .gte('entered_at', since)
      .not('claim_id', 'is', null)
      .not('entered_at', 'is', null),

    // Claims created within the period
    sb
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('record_type', 'Claim')
      .gte('created_time', since),

    // Historical stage dwell times — drives bottleneck section
    sb
      .from('claim_events')
      .select('stage, days_in_stage')
      .gt('days_in_stage', 0),

    // All estimates — drives byValue breakdown (filtered to open claim IDs in JS)
    sb
      .from('estimates')
      .select('claim_id, estimate_total')
      .not('claim_id', 'is', null),
  ])

  if (openClaimsRes.error) {
    return NextResponse.json({ error: openClaimsRes.error.message }, { status: 500 })
  }
  if (terminalEventsRes.error) {
    return NextResponse.json({ error: terminalEventsRes.error.message }, { status: 500 })
  }
  if (openedCountRes.error) {
    return NextResponse.json({ error: openedCountRes.error.message }, { status: 500 })
  }
  if (bottleneckEventsRes.error) {
    return NextResponse.json({ error: bottleneckEventsRes.error.message }, { status: 500 })
  }
  if (allEstimatesRes.error) {
    return NextResponse.json({ error: allEstimatesRes.error.message }, { status: 500 })
  }

  const openClaims     = openClaimsRes.data ?? []
  const terminalEvents = terminalEventsRes.data ?? []
  const now            = Date.now()

  // ── Always-current KPIs ───────────────────────────────────────────────────────

  const open    = openClaims.length
  const overdue = openClaims.filter(
    (c) => (c.modified_time as string) < overdueThreshold,
  ).length

  const ages = openClaims
    .map((c) => c.date_claim_is_reported as string | null)
    .filter((d): d is string => !!d)
    .map((d) => (now - new Date(d).getTime()) / MS_PER_DAY)
    .filter((d) => d >= 0)
  const avgDaysOpen =
    ages.length > 0 ? round1(ages.reduce((a, b) => a + b, 0) / ages.length) : 0

  // ── Period-scoped counts ─────────────────────────────────────────────────────

  // Deduplicate by claim — one claim can fire multiple terminal events; count once
  const closedClaimIds = new Set(terminalEvents.map((e) => e.claim_id as string))
  const deniedClaimIds = new Set(
    terminalEvents
      .filter((e) => e.stage === 'Claim Denied')
      .map((e) => e.claim_id as string),
  )

  const closedThisPeriod  = closedClaimIds.size
  const deniedThisPeriod  = deniedClaimIds.size
  const openedThisPeriod  = openedCountRes.count ?? 0

  // ── avgDaysToClose: wave 2 if there are closed claims ────────────────────────

  let avgDaysToClose = 0

  if (closedClaimIds.size > 0) {
    const { data: closedClaimsData } = await sb
      .from('claims')
      .select('id, created_time')
      .in('id', Array.from(closedClaimIds))
      .not('created_time', 'is', null)

    const createdAtById: Record<string, string> = {}
    for (const c of closedClaimsData ?? []) {
      if (c.created_time) createdAtById[c.id] = c.created_time as string
    }

    // Use the latest terminal event per claim to avoid double-counting
    const latestTerminal: Record<string, string> = {}
    for (const ev of terminalEvents) {
      const id  = ev.claim_id as string
      const ts  = ev.entered_at as string
      const prev = latestTerminal[id]
      if (!prev || ts > prev) latestTerminal[id] = ts
    }

    const daysToClose: number[] = []
    for (const [claimId, enteredAt] of Object.entries(latestTerminal)) {
      const createdAt = createdAtById[claimId]
      if (!createdAt) continue
      const days =
        (new Date(enteredAt).getTime() - new Date(createdAt).getTime()) / MS_PER_DAY
      if (days >= 0) daysToClose.push(days)
    }

    avgDaysToClose =
      daysToClose.length > 0
        ? round1(daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length)
        : 0
  }

  // ── Breakdowns (current snapshot of open claims) ──────────────────────────────

  const adjusterMap: Record<string, number> = {}
  const tankTypeMap: Record<string, number> = {}
  const stageMap:    Record<string, number> = {}

  for (const c of openClaims) {
    const adj = (c.owner_name as string | null) ?? 'Unassigned'
    adjusterMap[adj] = (adjusterMap[adj] ?? 0) + 1

    const tt = (c.tank_type as string | null) ?? 'Unknown'
    tankTypeMap[tt] = (tankTypeMap[tt] ?? 0) + 1

    const s = (c.stage as string | null) ?? 'Unknown'
    stageMap[s] = (stageMap[s] ?? 0) + 1
  }

  const byAdjuster = Object.entries(adjusterMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const byTankType = Object.entries(tankTypeMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  const byStage = Object.entries(stageMap)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)

  // ── byAge: open claims bucketed by age (created_time) ────────────────────────

  const ageMap: Record<string, number> = {
    '0–30 days':   0,
    '31–60 days':  0,
    '61–90 days':  0,
    '91–180 days': 0,
    '180+ days':        0,
  }
  for (const c of openClaims) {
    const created = c.created_time as string | null
    if (!created) continue
    const days = (now - new Date(created).getTime()) / MS_PER_DAY
    if      (days <= 30)  ageMap['0–30 days']++
    else if (days <= 60)  ageMap['31–60 days']++
    else if (days <= 90)  ageMap['61–90 days']++
    else if (days <= 180) ageMap['91–180 days']++
    else                  ageMap['180+ days']++
  }
  const byAge = Object.entries(ageMap).map(([bucket, count]) => ({ bucket, count }))

  // ── byValue: open claims bucketed by estimate total ───────────────────────────

  const openIdSet = new Set(openClaims.map((c) => c.id))
  const estimateByClaimId: Record<string, number> = {}
  for (const e of allEstimatesRes.data ?? []) {
    const id = e.claim_id as string | null
    if (id && openIdSet.has(id)) {
      estimateByClaimId[id] = (estimateByClaimId[id] ?? 0) + ((e.estimate_total as number | null) ?? 0)
    }
  }
  const valueMap: Record<string, number> = {
    'No Estimate': 0,
    'Under $5k':   0,
    '$5k–$15k':  0,
    '$15k–$50k': 0,
    '$50k+':       0,
  }
  for (const c of openClaims) {
    const est = estimateByClaimId[c.id] ?? 0
    if      (!est)        valueMap['No Estimate']++
    else if (est < 5000)  valueMap['Under $5k']++
    else if (est < 15000) valueMap['$5k–$15k']++
    else if (est < 50000) valueMap['$15k–$50k']++
    else                  valueMap['$50k+']++
  }
  const byValue = Object.entries(valueMap).map(([bucket, count]) => ({ bucket, count }))

  // ── byCoverage: open claims by deductible_paid status ────────────────────────

  let deductiblePaid = 0
  let deductiblePending = 0
  for (const c of openClaims) {
    if ((c.deductible_paid as boolean | null) === true) deductiblePaid++
    else deductiblePending++
  }
  const byCoverage = [
    { coverage: 'Deductible Paid',    count: deductiblePaid    },
    { coverage: 'Deductible Pending', count: deductiblePending },
  ]

  // ── Pipeline breakdown (AST vs UST, grouped by stage) ────────────────────────

  function toStageRows(claims: typeof openClaims): { stage: string; count: number }[] {
    const counts: Record<string, number> = {}
    for (const c of claims) {
      const s = (c.stage as string | null) ?? 'Unknown'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
  }

  const astClaims = openClaims.filter((c) => c.claim_status === 'ast_open')
  const ustClaims = openClaims.filter(
    (c) =>
      ['ust_open', 'ust_pre_tank'].includes((c.claim_status as string | null) ?? '') &&
      c.tank_type === 'UST',
  )
  const pipeline = {
    ast: toStageRows(astClaims),
    ust: toStageRows(ustClaims),
  }

  // ── Recent activity (last 10 open claims by modified_time) ───────────────────

  const recent = [...openClaims]
    .sort((a, b) =>
      ((b.modified_time as string) ?? '').localeCompare((a.modified_time as string) ?? ''),
    )
    .slice(0, 10)
    .map((c) => ({
      field_service_number: c.field_service_number as string | null,
      stage:                c.stage as string | null,
      owner_name:           c.owner_name as string | null,
      modified_time:        c.modified_time as string | null,
    }))

  // ── Bottlenecks (top 5 stages by avg historical dwell time) ──────────────────

  const dwellAgg: Record<string, number[]> = {}
  for (const ev of bottleneckEventsRes.data ?? []) {
    const s = ev.stage as string | null
    const d = ev.days_in_stage as number | null
    if (s && d != null && d > 0) {
      if (!dwellAgg[s]) dwellAgg[s] = []
      dwellAgg[s].push(d)
    }
  }

  const bottlenecks = Object.entries(dwellAgg)
    .filter(([, vals]) => vals.length >= 5)
    .map(([stage, vals]) => ({
      stage,
      avgDays: round1(vals.reduce((a, b) => a + b, 0) / vals.length),
      claimCount: vals.length,
    }))
    .sort((a, b) => b.avgDays - a.avgDays)
    .slice(0, 5)

  return NextResponse.json({
    period,
    since,
    open,
    overdue,
    avgDaysOpen,
    closedThisPeriod,
    openedThisPeriod,
    deniedThisPeriod,
    avgDaysToClose,
    byAdjuster,
    byTankType,
    byStage,
    byAge,
    byValue,
    byCoverage,
    pipeline,
    bottlenecks,
    recent,
  })
}
