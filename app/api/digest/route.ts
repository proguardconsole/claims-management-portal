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

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Returns the most recent Monday at 00:00:00 UTC and derived boundaries.
function weekBoundaries() {
  const now = new Date()
  const dow = now.getUTCDay() // 0 = Sun
  const toMonday = dow === 0 ? -6 : 1 - dow

  const weekStart = new Date(now)
  weekStart.setUTCDate(weekStart.getUTCDate() + toMonday)
  weekStart.setUTCHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7)

  const lastWeekEnd = new Date(weekEnd)
  lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7)

  return { weekStart, weekEnd, lastWeekStart, lastWeekEnd }
}

type SB = ReturnType<typeof getServerSupabase>

// ── route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb: SB = getServerSupabase()
    const { weekStart, weekEnd, lastWeekStart } = weekBoundaries()
    const now = Date.now()

    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    // ── 11 parallel queries ───────────────────────────────────────────────────

    const [
      openClaimsRes,
      openedThisWeekRes,
      openedLastWeekRes,
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

      // 2. Opened this week
      sb
        .from('claims')
        .select('tank_type')
        .eq('record_type', 'Claim')
        .gte('created_time', weekStart.toISOString()),

      // 3. Opened last week
      sb
        .from('claims')
        .select('tank_type')
        .eq('record_type', 'Claim')
        .gte('created_time', lastWeekStart.toISOString())
        .lt('created_time', weekStart.toISOString()),

      // 4. All claims — pipeline lookup for financial and closed-event joins
      sb
        .from('claims')
        .select('id, tank_type'),

      // 5. Closed events this week + last week (split in JS at weekStart)
      sb
        .from('claim_events')
        .select('claim_id, entered_at')
        .in('stage', CLOSED_STAGES_ARRAY)
        .gte('entered_at', lastWeekStart.toISOString())
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

      // 9. YTD closed claims — denial rate + denied this month
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
    if (openClaimsRes.error)      throw new Error(`openClaims: ${openClaimsRes.error.message}`)
    if (openedThisWeekRes.error)  throw new Error(`openedThisWeek: ${openedThisWeekRes.error.message}`)
    if (openedLastWeekRes.error)  throw new Error(`openedLastWeek: ${openedLastWeekRes.error.message}`)
    if (allClaimsPipelineRes.error) throw new Error(`allClaimsPipeline: ${allClaimsPipelineRes.error.message}`)
    if (closedEventsRes.error)    throw new Error(`closedEvents: ${closedEventsRes.error.message}`)
    if (allEventsRes.error)       throw new Error(`allEvents: ${allEventsRes.error.message}`)
    if (estimatesRes.error)       throw new Error(`estimates: ${estimatesRes.error.message}`)
    if (paymentsRes.error)        throw new Error(`payments: ${paymentsRes.error.message}`)
    if (ytdClosedRes.error)       throw new Error(`ytdClosed: ${ytdClosedRes.error.message}`)
    if (denialReasonsRes.error)   throw new Error(`denialReasons: ${denialReasonsRes.error.message}`)
    if (lastSyncedRes.error)      throw new Error(`lastSynced: ${lastSyncedRes.error.message}`)

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

    const astData = { open: 0, stale_count: 0, opened_this_week: 0, closed_this_week: 0 }
    const ustData = { open: 0, stale_count: 0, opened_this_week: 0, closed_this_week: 0 }

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
      const days = (now - new Date(claim.modified_time as string).getTime()) / MS_PER_DAY
      const pipeline = normalizePipeline(claim.tank_type)

      if (days > 14) staleCount++
      if (days > 21) staleCount7dAgo++ // was stale 7 days ago

      if (days > 60) {
        stale60d.push({
          claim_id: claim.id,
          fsn: (claim.field_service_number as string | null) ?? (claim.deal_name as string | null) ?? claim.id,
          owner_name: (claim.owner_name as string | null) ?? '',
          stage: claim.stage as string,
          days_stale: round1(days),
          tank_type: (claim.tank_type as string | null) ?? '',
          zoho_id: claim.id,
        })
      }

      if (claim.emergency === true) {
        emergencyItems.push({
          claim_id: claim.id,
          fsn: (claim.field_service_number as string | null) ?? (claim.deal_name as string | null) ?? claim.id,
          owner_name: (claim.owner_name as string | null) ?? '',
          stage: claim.stage as string,
          days_stale: round1(days),
          tank_type: (claim.tank_type as string | null) ?? '',
          zoho_id: claim.id,
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
        const bnKey = `${claim.stage}||${pipeline}`
        const enteredAt = latestEntered[`${claim.id}||${claim.stage}`] ?? (claim.modified_time as string)
        const bnDays = enteredAt ? (now - new Date(enteredAt).getTime()) / MS_PER_DAY : 0
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
          agent_name: name,
          total_open: a.total_open,
          stale_count: a.stale_count,
          stale_pct: Math.round((a.stale_count / a.total_open) * 100),
          oldest_claim_days: round1(a.oldest_days),
          ast_open: a.ast_open,
          ust_open: a.ust_open,
        }
      })
      .sort((a, b) => b.stale_count - a.stale_count || b.total_open - a.total_open)

    // ── OPENED / CLOSED VOLUME ────────────────────────────────────────────────

    const openedThisWeekClaims = openedThisWeekRes.data ?? []
    const openedThisWeek = openedThisWeekClaims.length
    for (const c of openedThisWeekClaims) {
      if (c.tank_type === 'AST') astData.opened_this_week++
      if (c.tank_type === 'UST') ustData.opened_this_week++
    }

    const openedLastWeekClaims = openedLastWeekRes.data ?? []
    const openedLastWeek = openedLastWeekClaims.length
    let astOpenedLastWeek = 0
    let ustOpenedLastWeek = 0
    for (const c of openedLastWeekClaims) {
      if (c.tank_type === 'AST') astOpenedLastWeek++
      if (c.tank_type === 'UST') ustOpenedLastWeek++
    }

    // Split closed events into this-week and last-week buckets
    const weekStartISO = weekStart.toISOString()
    const closedThisWeekSet: Record<string, true> = {}
    const closedLastWeekSet: Record<string, true> = {}
    const astClosedThisWeekSet: Record<string, true> = {}
    const ustClosedThisWeekSet: Record<string, true> = {}

    for (const ev of closedEventsRes.data ?? []) {
      if ((ev.entered_at as string) >= weekStartISO) {
        closedThisWeekSet[ev.claim_id as string] = true
        const pipeline = pipelineByClaimId[ev.claim_id as string]
        if (pipeline === 'AST') astClosedThisWeekSet[ev.claim_id as string] = true
        if (pipeline === 'UST') ustClosedThisWeekSet[ev.claim_id as string] = true
      } else {
        closedLastWeekSet[ev.claim_id as string] = true
      }
    }

    const closedThisWeek = Object.keys(closedThisWeekSet).length
    const closedLastWeek = Object.keys(closedLastWeekSet).length
    astData.closed_this_week = Object.keys(astClosedThisWeekSet).length
    ustData.closed_this_week = Object.keys(ustClosedThisWeekSet).length

    // Per-pipeline last-week closes (for wow_open_delta)
    let astClosedLastWeek = 0
    let ustClosedLastWeek = 0
    for (const claimId of Object.keys(closedLastWeekSet)) {
      const pipeline = pipelineByClaimId[claimId]
      if (pipeline === 'AST') astClosedLastWeek++
      if (pipeline === 'UST') ustClosedLastWeek++
    }

    // ── WOW ──────────────────────────────────────────────────────────────────

    // open_total_delta: proxy = current + last_week_closes - last_week_opens
    // delta = current - proxy = last_week_opens - last_week_closes
    const wowOpenedDelta    = openedThisWeek - openedLastWeek
    const wowClosedDelta    = closedThisWeek - closedLastWeek
    const wowOpenTotalDelta = openedLastWeek - closedLastWeek
    const wowStaleRateDelta = round1(staleRatePct - staleRate7dAgo)
    const astWowOpenDelta   = astOpenedLastWeek - astClosedLastWeek
    const ustWowOpenDelta   = ustOpenedLastWeek - ustClosedLastWeek

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
          total_estimated: 0,
          total_contractor_costs: 0,
          total_state_fees: 0,
          total_adjuster_fees: 0,
        }
      }
      estByPipeline[pipeline].total_estimated       += (e.estimate_total     as number) ?? 0
      estByPipeline[pipeline].total_contractor_costs += (e.contractor_costs  as number) ?? 0
      estByPipeline[pipeline].total_state_fees      += (e.state_fees         as number) ?? 0
      estByPipeline[pipeline].total_adjuster_fees   += (e.adjuster_fees      as number) ?? 0
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

    // Avoid Set spread — use Record pattern for unique pipeline keys
    const pipelineUnion: Record<string, true> = {}
    for (const p of Object.keys(estByPipeline)) pipelineUnion[p] = true
    for (const p of Object.keys(pmtByPipeline)) pipelineUnion[p] = true

    const byPipeline = Object.keys(pipelineUnion)
      .filter((p) => p === 'AST' || p === 'UST')
      .map((p) => ({
        pipeline: p,
        estimated: round1(estByPipeline[p]?.total_estimated ?? 0),
        collected: round1(pmtByPipeline[p] ?? 0),
      }))
      .sort((a, b) => a.pipeline.localeCompare(b.pipeline))

    // ── DENIALS ───────────────────────────────────────────────────────────────

    const ytdClosed   = ytdClosedRes.data ?? []
    const ytdTotal    = ytdClosed.length
    const ytdDenied   = ytdClosed.filter((c) => c.stage === 'Claim Denied').length
    const ytdDenialRate = ytdTotal > 0 ? round1((ytdDenied / ytdTotal) * 100) : 0

    const monthStartISO = monthStart.toISOString()
    const deniedThisMonth = ytdClosed.filter(
      (c) => c.stage === 'Claim Denied' && (c.modified_time as string) >= monthStartISO,
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
        week_start:     weekStart.toISOString(),
        week_end:       weekEnd.toISOString(),
        last_synced_at: lastSyncedAt,
      },
      snapshot: {
        total_open:          totalOpen,
        opened_this_week:    openedThisWeek,
        closed_this_week:    closedThisWeek,
        stale_rate_pct:      staleRatePct,
        total_estimated:     round1(totalEstimated),
        collection_rate_pct: collectionRate,
      },
      wow: {
        opened_delta:      wowOpenedDelta,
        closed_delta:      wowClosedDelta,
        open_total_delta:  wowOpenTotalDelta,
        stale_rate_delta:  wowStaleRateDelta,
      },
      pipelines: {
        ast: {
          open:              astData.open,
          opened_this_week:  astData.opened_this_week,
          closed_this_week:  astData.closed_this_week,
          stale_count:       astData.stale_count,
          stale_rate_pct:    astData.open > 0 ? round1((astData.stale_count / astData.open) * 100) : 0,
          wow_open_delta:    astWowOpenDelta,
        },
        ust: {
          open:              ustData.open,
          opened_this_week:  ustData.opened_this_week,
          closed_this_week:  ustData.closed_this_week,
          stale_count:       ustData.stale_count,
          stale_rate_pct:    ustData.open > 0 ? round1((ustData.stale_count / ustData.open) * 100) : 0,
          wow_open_delta:    ustWowOpenDelta,
        },
      },
      bottlenecks,
      attention: {
        stale_60d:  stale60d,
        emergency:  emergencyItems,
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
        denied_this_month:    deniedThisMonth,
        ytd_denial_rate_pct:  ytdDenialRate,
        reasons,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
