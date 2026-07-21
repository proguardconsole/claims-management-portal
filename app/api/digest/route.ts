import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24

const CLOSED_STAGES_TUPLE = '("Complete","Completed","Claim Denied")'
const CLOSED_STAGES_ARRAY = ['Complete', 'Completed', 'Claim Denied']

const VALID_PERIODS = ['week', 'month', 'quarter', 'year'] as const
type Period = typeof VALID_PERIODS[number]

// ── helpers ────────────────────────────────────────────────────────────────────

function normalizePipeline(tankType: string | null | undefined): string {
  if (tankType === 'AST') return 'AST'
  if (tankType === 'UST') return 'UST'
  return 'Other'
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function periodBoundaries(period: Period) {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  let start: Date
  let label: string
  let prevStart: Date

  if (period === 'month') {
    start     = new Date(now.getFullYear(), now.getMonth(), 1)
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    label     = 'Monthly'
  } else if (period === 'quarter') {
    const q   = Math.floor(now.getMonth() / 3)
    start     = new Date(now.getFullYear(), q * 3, 1)
    prevStart = new Date(now.getFullYear(), q * 3 - 3, 1)
    label     = 'Quarterly'
  } else if (period === 'year') {
    start     = new Date(now.getFullYear(), 0, 1)
    prevStart = new Date(now.getFullYear() - 1, 0, 1)
    label     = 'Annual'
  } else {
    // week (default) — UTC Monday alignment
    const dow  = now.getUTCDay()
    const diff = dow === 0 ? -6 : 1 - dow
    start      = new Date(now)
    start.setUTCDate(start.getUTCDate() + diff)
    start.setUTCHours(0, 0, 0, 0)
    prevStart  = new Date(start)
    prevStart.setUTCDate(prevStart.getUTCDate() - 7)
    label      = 'Weekly'
  }

  return { start, end, prevStart, label }
}

type SB = ReturnType<typeof getServerSupabase>

// ── route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodParam = req.nextUrl.searchParams.get('period') ?? 'week'
  const period: Period = (VALID_PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : 'week'

  try {
    const sb: SB = getServerSupabase()
    const { start, end, prevStart, label: periodLabel } = periodBoundaries(period)
    const nowMs = Date.now()

    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))

    // ── 11 parallel queries ───────────────────────────────────────────────────

    const [
      openClaimsRes,
      openedThisPeriodRes,
      openedPrevPeriodRes,
      allClaimsPipelineRes,
      closedEventsRes,
      allEventsRes,
      estimatesRes,
      paymentsRes,
      ytdClosedRes,
      denialReasonsRes,
      lastSyncedRes,
    ] = await Promise.all([
      // 1. Open claims — full payload for attention, agents, snapshot, bottleneck
      sb
        .from('claims')
        .select('id, field_service_number, deal_name, owner_name, stage, modified_time, tank_type, emergency')
        .eq('record_type', 'Claim')
        .not('stage', 'in', CLOSED_STAGES_TUPLE)
        .not('modified_time', 'is', null),

      // 2. Opened this period
      sb
        .from('claims')
        .select('tank_type')
        .eq('record_type', 'Claim')
        .gte('created_time', start.toISOString()),

      // 3. Opened previous period
      sb
        .from('claims')
        .select('tank_type')
        .eq('record_type', 'Claim')
        .gte('created_time', prevStart.toISOString())
        .lt('created_time', start.toISOString()),

      // 4. All claims — pipeline lookup for financial and closed-event joins
      sb
        .from('claims')
        .select('id, tank_type'),

      // 5. Closed events this period + prev period (split in JS at start)
      sb
        .from('claim_events')
        .select('claim_id, entered_at')
        .in('stage', CLOSED_STAGES_ARRAY)
        .gte('entered_at', prevStart.toISOString())
        .not('entered_at', 'is', null),

      // 6. All events — for bottleneck stage-entered lookup
      sb
        .from('claim_events')
        .select('claim_id, stage, entered_at')
        .not('entered_at', 'is', null),

      // 7. Estimates
      sb
        .from('estimates')
        .select('claim_id, estimate_total, contractor_costs, state_fees, adjuster_fees')
        .not('claim_id', 'is', null),

      // 8. Payments
      sb
        .from('claim_payments')
        .select('claim_id, amount')
        .not('claim_id', 'is', null),

      // 9. YTD closed claims — denial rate + denied this period
      sb
        .from('claims')
        .select('stage, modified_time')
        .eq('record_type', 'Claim')
        .in('stage', CLOSED_STAGES_ARRAY)
        .gte('modified_time', yearStart.toISOString())
        .not('modified_time', 'is', null),

      // 10. Denial reasons (all-time)
      sb
        .from('claims')
        .select('claim_denied_reason')
        .eq('stage', 'Claim Denied')
        .not('claim_denied_reason', 'is', null),

      // 11. Last synced — MAX(modified_time) proxy
      sb
        .from('claims')
        .select('modified_time')
        .order('modified_time', { ascending: false })
        .limit(1),
    ])

    // Error checks
    if (openClaimsRes.error)        throw new Error(`openClaims: ${openClaimsRes.error.message}`)
    if (openedThisPeriodRes.error)  throw new Error(`openedThisPeriod: ${openedThisPeriodRes.error.message}`)
    if (openedPrevPeriodRes.error)  throw new Error(`openedPrevPeriod: ${openedPrevPeriodRes.error.message}`)
    if (allClaimsPipelineRes.error) throw new Error(`allClaimsPipeline: ${allClaimsPipelineRes.error.message}`)
    if (closedEventsRes.error)      throw new Error(`closedEvents: ${closedEventsRes.error.message}`)
    if (allEventsRes.error)         throw new Error(`allEvents: ${allEventsRes.error.message}`)
    if (estimatesRes.error)         throw new Error(`estimates: ${estimatesRes.error.message}`)
    if (paymentsRes.error)          throw new Error(`payments: ${paymentsRes.error.message}`)
    if (ytdClosedRes.error)         throw new Error(`ytdClosed: ${ytdClosedRes.error.message}`)
    if (denialReasonsRes.error)     throw new Error(`denialReasons: ${denialReasonsRes.error.message}`)
    if (lastSyncedRes.error)        throw new Error(`lastSynced: ${lastSyncedRes.error.message}`)

    // ── Pipeline lookup from ALL claims ───────────────────────────────────────

    const pipelineByClaimId: Record<string, string> = {}
    for (const c of allClaimsPipelineRes.data ?? []) {
      pipelineByClaimId[c.id] = normalizePipeline(c.tank_type)
    }

    // ── SNAPSHOT, ATTENTION, AGENTS (single pass over open claims) ────────────

    const openClaims = openClaimsRes.data ?? []
    let totalOpen = 0
    let staleCount = 0
    let staleCount7dAgo = 0

    type AttentionItem = {
      claim_id: string
      fsn: string
      owner_name: string
      stage: string
      days_stale: number
      tank_type: string
      zoho_id: string
    }
    const stale60d: AttentionItem[] = []
    const emergencyItems: AttentionItem[] = []

    type AgentAgg = {
      total_open: number
      stale_count: number
      oldest_days: number
      ast_open: number
      ust_open: number
    }
    const agentAgg: Record<string, AgentAgg> = {}

    const astData = { open: 0, stale_count: 0, opened_this_period: 0, closed_this_period: 0 }
    const ustData = { open: 0, stale_count: 0, opened_this_period: 0, closed_this_period: 0 }

    // Build stage-entered lookup for bottleneck (uses allEventsRes)
    const latestEntered: Record<string, string> = {}
    for (const ev of allEventsRes.data ?? []) {
      const key = `${ev.claim_id}||${ev.stage}`
      const prev = latestEntered[key]
      if (!prev || (ev.entered_at as string) > prev) latestEntered[key] = ev.entered_at as string
    }

    type BnBucket = { days: number[]; pipeline: string }
    const bnAgg: Record<string, BnBucket> = {}

    for (const claim of openClaims) {
      totalOpen++
      const days = (nowMs - new Date(claim.modified_time as string).getTime()) / MS_PER_DAY
      const pipeline = normalizePipeline(claim.tank_type)

      if (days > 14) staleCount++
      if (days > 21) staleCount7dAgo++

      if (days > 60) {
        stale60d.push({
          claim_id:   claim.id,
          fsn:        (claim.field_service_number as string | null) ?? (claim.deal_name as string | null) ?? claim.id,
          owner_name: (claim.owner_name as string | null) ?? '',
          stage:      claim.stage as string,
          days_stale: round1(days),
          tank_type:  (claim.tank_type as string | null) ?? '',
          zoho_id:    claim.id,
        })
      }

      if (claim.emergency === true) {
        emergencyItems.push({
          claim_id:   claim.id,
          fsn:        (claim.field_service_number as string | null) ?? (claim.deal_name as string | null) ?? claim.id,
          owner_name: (claim.owner_name as string | null) ?? '',
          stage:      claim.stage as string,
          days_stale: round1(days),
          tank_type:  (claim.tank_type as string | null) ?? '',
          zoho_id:    claim.id,
        })
      }

      // Pipeline counters
      if (pipeline === 'AST') { astData.open++; if (days > 14) astData.stale_count++ }
      if (pipeline === 'UST') { ustData.open++; if (days > 14) ustData.stale_count++ }

      // Agent aggregation
      const agentName = (claim.owner_name as string | null)?.trim() ?? ''
      if (agentName) {
        if (!agentAgg[agentName]) {
          agentAgg[agentName] = { total_open: 0, stale_count: 0, oldest_days: 0, ast_open: 0, ust_open: 0 }
        }
        agentAgg[agentName].total_open++
        if (days > 14) agentAgg[agentName].stale_count++
        if (days > agentAgg[agentName].oldest_days) agentAgg[agentName].oldest_days = days
        if (claim.tank_type === 'AST') agentAgg[agentName].ast_open++
        if (claim.tank_type === 'UST') agentAgg[agentName].ust_open++
      }

      // Bottleneck bucket
      if (claim.stage) {
        const bnKey    = `${claim.stage}||${pipeline}`
        const enteredAt = latestEntered[`${claim.id}||${claim.stage}`] ?? (claim.modified_time as string)
        const bnDays   = enteredAt ? (nowMs - new Date(enteredAt).getTime()) / MS_PER_DAY : 0
        if (!bnAgg[bnKey]) bnAgg[bnKey] = { days: [], pipeline }
        bnAgg[bnKey].days.push(bnDays)
      }
    }

    stale60d.sort((a, b) => b.days_stale - a.days_stale)

    const staleRatePct   = totalOpen > 0 ? round1((staleCount / totalOpen) * 100) : 0
    const staleRate7dAgo = totalOpen > 0 ? round1((staleCount7dAgo / totalOpen) * 100) : 0

    // Agents
    const agents = Object.keys(agentAgg)
      .map((name) => {
        const a = agentAgg[name]
        return {
          agent_name:       name,
          total_open:       a.total_open,
          stale_count:      a.stale_count,
          stale_pct:        Math.round((a.stale_count / a.total_open) * 100),
          oldest_claim_days: round1(a.oldest_days),
          ast_open:         a.ast_open,
          ust_open:         a.ust_open,
        }
      })
      .sort((a, b) => b.stale_count - a.stale_count || b.total_open - a.total_open)

    // ── OPENED / CLOSED VOLUME ────────────────────────────────────────────────

    const openedThisPeriodClaims = openedThisPeriodRes.data ?? []
    const openedThisPeriod = openedThisPeriodClaims.length
    for (const c of openedThisPeriodClaims) {
      if (c.tank_type === 'AST') astData.opened_this_period++
      if (c.tank_type === 'UST') ustData.opened_this_period++
    }

    const openedPrevPeriodClaims = openedPrevPeriodRes.data ?? []
    const openedPrevPeriod = openedPrevPeriodClaims.length
    let astOpenedPrevPeriod = 0
    let ustOpenedPrevPeriod = 0
    for (const c of openedPrevPeriodClaims) {
      if (c.tank_type === 'AST') astOpenedPrevPeriod++
      if (c.tank_type === 'UST') ustOpenedPrevPeriod++
    }

    // Split closed events into this-period and prev-period buckets
    const startISO = start.toISOString()
    const closedThisPeriodSet: Record<string, true> = {}
    const closedPrevPeriodSet: Record<string, true> = {}
    const astClosedThisPeriodSet: Record<string, true> = {}
    const ustClosedThisPeriodSet: Record<string, true> = {}

    for (const ev of closedEventsRes.data ?? []) {
      if ((ev.entered_at as string) >= startISO) {
        closedThisPeriodSet[ev.claim_id as string] = true
        const pl = pipelineByClaimId[ev.claim_id as string]
        if (pl === 'AST') astClosedThisPeriodSet[ev.claim_id as string] = true
        if (pl === 'UST') ustClosedThisPeriodSet[ev.claim_id as string] = true
      } else {
        closedPrevPeriodSet[ev.claim_id as string] = true
      }
    }

    const closedThisPeriod = Object.keys(closedThisPeriodSet).length
    const closedPrevPeriod = Object.keys(closedPrevPeriodSet).length
    astData.closed_this_period = Object.keys(astClosedThisPeriodSet).length
    ustData.closed_this_period = Object.keys(ustClosedThisPeriodSet).length

    // Per-pipeline prev-period closes (for pop_open_delta)
    let astClosedPrevPeriod = 0
    let ustClosedPrevPeriod = 0
    for (const claimId of Object.keys(closedPrevPeriodSet)) {
      const pl = pipelineByClaimId[claimId]
      if (pl === 'AST') astClosedPrevPeriod++
      if (pl === 'UST') ustClosedPrevPeriod++
    }

    // ── PERIOD-OVER-PERIOD DELTAS ─────────────────────────────────────────────

    const popOpenedDelta    = openedThisPeriod - openedPrevPeriod
    const popClosedDelta    = closedThisPeriod - closedPrevPeriod
    const popOpenTotalDelta = openedPrevPeriod - closedPrevPeriod
    const popStaleRateDelta = round1(staleRatePct - staleRate7dAgo)
    const astPopOpenDelta   = astOpenedPrevPeriod - astClosedPrevPeriod
    const ustPopOpenDelta   = ustOpenedPrevPeriod - ustClosedPrevPeriod

    // ── BOTTLENECK (top 3) ────────────────────────────────────────────────────

    const bottlenecks = Object.keys(bnAgg)
      .map((key) => {
        const parts = key.split('||')
        const { days, pipeline } = bnAgg[key]
        const avg = days.reduce((a, b) => a + b, 0) / days.length
        return { stage: parts[0], pipeline, claim_count: days.length, avg_days: round1(avg) }
      })
      .sort((a, b) => b.avg_days - a.avg_days)
      .slice(0, 3)

    // ── FINANCIAL ─────────────────────────────────────────────────────────────

    type EstAgg = {
      total_estimated: number
      total_contractor_costs: number
      total_state_fees: number
      total_adjuster_fees: number
    }
    const estByPipeline: Record<string, EstAgg> = {}

    for (const e of estimatesRes.data ?? []) {
      const pipeline = pipelineByClaimId[e.claim_id ?? ''] ?? 'Other'
      if (!estByPipeline[pipeline]) {
        estByPipeline[pipeline] = {
          total_estimated:        0,
          total_contractor_costs: 0,
          total_state_fees:       0,
          total_adjuster_fees:    0,
        }
      }
      estByPipeline[pipeline].total_estimated        += (e.estimate_total    as number) ?? 0
      estByPipeline[pipeline].total_contractor_costs += (e.contractor_costs  as number) ?? 0
      estByPipeline[pipeline].total_state_fees       += (e.state_fees        as number) ?? 0
      estByPipeline[pipeline].total_adjuster_fees    += (e.adjuster_fees     as number) ?? 0
    }

    const pmtByPipeline: Record<string, number> = {}
    for (const p of paymentsRes.data ?? []) {
      const pipeline = pipelineByClaimId[p.claim_id ?? ''] ?? 'Other'
      pmtByPipeline[pipeline] = (pmtByPipeline[pipeline] ?? 0) + ((p.amount as number) ?? 0)
    }

    const totalEstimated = Object.values(estByPipeline).reduce((s, e) => s + e.total_estimated, 0)
    const totalPaid      = Object.values(pmtByPipeline).reduce((s, n) => s + n, 0)
    const collectionRate = totalEstimated > 0 ? round1((totalPaid / totalEstimated) * 100) : 0

    const contractorCosts = Object.values(estByPipeline).reduce((s, e) => s + e.total_contractor_costs, 0)
    const stateFees       = Object.values(estByPipeline).reduce((s, e) => s + e.total_state_fees, 0)
    const adjusterFees    = Object.values(estByPipeline).reduce((s, e) => s + e.total_adjuster_fees, 0)

    const pipelineUnion: Record<string, true> = {}
    for (const p of Object.keys(estByPipeline)) pipelineUnion[p] = true
    for (const p of Object.keys(pmtByPipeline)) pipelineUnion[p] = true

    const byPipeline = Object.keys(pipelineUnion)
      .filter((p) => p === 'AST' || p === 'UST')
      .map((p) => ({
        pipeline:  p,
        estimated: round1(estByPipeline[p]?.total_estimated ?? 0),
        collected: round1(pmtByPipeline[p] ?? 0),
      }))
      .sort((a, b) => a.pipeline.localeCompare(b.pipeline))

    // ── DENIALS ───────────────────────────────────────────────────────────────

    const ytdClosed     = ytdClosedRes.data ?? []
    const ytdTotal      = ytdClosed.length
    const ytdDenied     = ytdClosed.filter((c) => c.stage === 'Claim Denied').length
    const ytdDenialRate = ytdTotal > 0 ? round1((ytdDenied / ytdTotal) * 100) : 0

    const deniedThisPeriod = ytdClosed.filter(
      (c) => c.stage === 'Claim Denied' && (c.modified_time as string) >= startISO,
    ).length

    const reasonAgg: Record<string, number> = {}
    for (const r of denialReasonsRes.data ?? []) {
      const reason = r.claim_denied_reason as string
      reasonAgg[reason] = (reasonAgg[reason] ?? 0) + 1
    }
    const reasons = Object.keys(reasonAgg)
      .map((r) => ({ reason: r, count: reasonAgg[r] }))
      .sort((a, b) => b.count - a.count)

    // ── RESPONSE ──────────────────────────────────────────────────────────────

    const lastSyncedAt = (lastSyncedRes.data?.[0]?.modified_time as string | null | undefined) ?? null

    return NextResponse.json({
      meta: {
        generated_at:   new Date().toISOString(),
        period,
        period_label:   periodLabel,
        period_start:   start.toISOString(),
        period_end:     end.toISOString(),
        last_synced_at: lastSyncedAt,
      },
      snapshot: {
        total_open:          totalOpen,
        opened_this_period:  openedThisPeriod,
        closed_this_period:  closedThisPeriod,
        stale_rate_pct:      staleRatePct,
        total_estimated:     round1(totalEstimated),
        collection_rate_pct: collectionRate,
      },
      pop: {
        opened_delta:      popOpenedDelta,
        closed_delta:      popClosedDelta,
        open_total_delta:  popOpenTotalDelta,
        stale_rate_delta:  popStaleRateDelta,
      },
      pipelines: {
        ast: {
          open:               astData.open,
          opened_this_period: astData.opened_this_period,
          closed_this_period: astData.closed_this_period,
          stale_count:        astData.stale_count,
          stale_rate_pct:     astData.open > 0 ? round1((astData.stale_count / astData.open) * 100) : 0,
          pop_open_delta:     astPopOpenDelta,
        },
        ust: {
          open:               ustData.open,
          opened_this_period: ustData.opened_this_period,
          closed_this_period: ustData.closed_this_period,
          stale_count:        ustData.stale_count,
          stale_rate_pct:     ustData.open > 0 ? round1((ustData.stale_count / ustData.open) * 100) : 0,
          pop_open_delta:     ustPopOpenDelta,
        },
      },
      bottlenecks,
      attention: {
        stale_60d: stale60d,
        emergency: emergencyItems,
      },
      agents,
      financial: {
        total_estimated:     round1(totalEstimated),
        total_paid:          round1(totalPaid),
        collection_rate_pct: collectionRate,
        contractor_costs:    round1(contractorCosts),
        state_fees:          round1(stateFees),
        adjuster_fees:       round1(adjusterFees),
        by_pipeline:         byPipeline,
      },
      denials: {
        denied_this_period:  deniedThisPeriod,
        ytd_denial_rate_pct: ytdDenialRate,
        reasons,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
