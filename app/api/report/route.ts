import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ─── constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Columns fetched for every claim record used in section assembly
const CLAIM_COLS =
  'id, field_service_number, deal_name, stage, claim_status, tank_type, claim_trigger, ' +
  'contact_name, city, claim_state, owner_name, created_time'

// ─── helpers ──────────────────────────────────────────────────────────────────

function authOk(req: NextRequest): boolean {
  return req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function daysBetween(fromIso: string | null, toIso: string): number {
  if (!fromIso) return 0
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY))
}

function agingBucket(days: number): string {
  if (days < 90)  return '<90 Days'
  if (days < 180) return '90-180 Days'
  if (days < 365) return '180-365 Days'
  return '365+ Days'
}

// Short-circuit fallback for conditional wave-2 fetches
function emptyFetch(): Promise<{ data: R[] | null; error: null }> {
  return Promise.resolve({ data: [], error: null })
}

// ─── types ────────────────────────────────────────────────────────────────────

type R = Record<string, unknown>

type EstSummary = {
  estimate_total:  number
  adjuster_fees:   number
  contractor_name: string | null
}

type PaySummary = {
  billing_value: number
  sf_collected:  number
  ded_collected: number
}

export type ClaimRow = {
  id:                   string
  field_service_number: string | null
  deal_name:            string | null
  stage:                string | null
  claim_status:         string | null
  tank_type:            string | null
  claim_trigger:        string | null
  contact_name:         string | null
  city:                 string | null
  claim_state:          string | null
  owner_name:           string | null
  created_time:         string | null
  close_date:           string | null
  days_open:            number
  aging:                string
  estimate_total:       number
  adjuster_fees:        number
  contractor_name:      string | null
  billing_value:        number
  sf_collected:         number
  ded_collected:        number
  net_incurred:         number
}

export type DeniedRow = {
  id:                   string
  field_service_number: string | null
  contact_name:         string | null
  stage:                string | null
  claim_trigger:        string | null
  tank_type:            string | null
  close_date:           string | null
  manual:               boolean
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const p    = req.nextUrl.searchParams
  const asOf = p.get('as_of') ?? new Date().toISOString().slice(0, 10)

  const asOfDate  = new Date(asOf + 'T12:00:00Z')
  const weekStart = p.get('week_start') ??
    new Date(asOfDate.getTime() - 7 * MS_PER_DAY).toISOString().slice(0, 10)

  // Millisecond boundaries for JS-side timestamp comparisons
  const weekStartMs = new Date(weekStart + 'T00:00:00Z').getTime()
  const asOfMs      = new Date(asOf      + 'T23:59:59Z').getTime()

  // ISO strings for Supabase .gte/.lte filters
  const weekStartTs = new Date(weekStart + 'T00:00:00Z').toISOString()
  const asOfTs      = new Date(asOf      + 'T23:59:59Z').toISOString()

  const sb = getServerSupabase()

  // ── Wave 1: parallel base fetches ─────────────────────────────────────────

  const [openRes, pendingRes, termEventsRes, exclusionsRes, manualDenialsRes, snapshotsRes] =
    await Promise.all([
      sb
        .from('claims')
        .select(CLAIM_COLS)
        .in('claim_status', ['ast_open', 'ust_open'])
        .not('owner_name', 'ilike', '%admin%'),

      sb
        .from('claims')
        .select(CLAIM_COLS)
        .eq('claim_status', 'ust_pre_tank')
        .not('owner_name', 'ilike', '%admin%'),

      sb
        .from('claim_events')
        .select('claim_id, stage, entered_at')
        .in('stage', ['Complete', 'Claim Denied'])
        .gte('entered_at', weekStartTs)
        .lte('entered_at', asOfTs),

      sb.from('report_exclusions').select('field_service_number'),

      sb
        .from('report_manual_denials')
        .select('id, claim_reference, contact_name, trigger, tank_type, denial_date')
        .gte('denial_date', weekStart)
        .lte('denial_date', asOf),

      sb
        .from('pending_pull_snapshots')
        .select('field_service_number')
        .lt('snapshot_date', weekStart),
    ])

  if (openRes.error)          return NextResponse.json({ error: `open: ${openRes.error.message}` },              { status: 500 })
  if (pendingRes.error)       return NextResponse.json({ error: `pending: ${pendingRes.error.message}` },        { status: 500 })
  if (termEventsRes.error)    return NextResponse.json({ error: `events: ${termEventsRes.error.message}` },      { status: 500 })
  if (exclusionsRes.error)    return NextResponse.json({ error: `exclusions: ${exclusionsRes.error.message}` },  { status: 500 })
  if (manualDenialsRes.error) return NextResponse.json({ error: `denials: ${manualDenialsRes.error.message}` }, { status: 500 })
  if (snapshotsRes.error)     return NextResponse.json({ error: `snapshots: ${snapshotsRes.error.message}` },   { status: 500 })

  // Build lookup sets
  const exclusionFsns     = new Set((exclusionsRes.data    ?? []).map((r) => (r as unknown as R).field_service_number as string))
  const priorSnapshotFsns = new Set((snapshotsRes.data     ?? []).map((r) => (r as unknown as R).field_service_number as string))

  const openClaims    = (openRes.data    ?? []).filter((c) => !exclusionFsns.has((c as unknown as R).field_service_number as string))
  const pendingClaims = (pendingRes.data ?? []).filter((c) => !exclusionFsns.has((c as unknown as R).field_service_number as string))

  // Build close-date maps from terminal events (MAX entered_at per claim per stage)
  const completeDateById:    Record<string, string> = {}
  const claimDeniedDateById: Record<string, string> = {}

  for (const ev of termEventsRes.data ?? []) {
    const e  = ev as unknown as R
    const id = e.claim_id  as string | null
    const ts = e.entered_at as string | null
    if (!id || !ts) continue
    if (e.stage === 'Complete') {
      if (!completeDateById[id]    || ts > completeDateById[id])    completeDateById[id]    = ts
    } else if (e.stage === 'Claim Denied') {
      if (!claimDeniedDateById[id] || ts > claimDeniedDateById[id]) claimDeniedDateById[id] = ts
    }
  }

  const terminalIds = Array.from(new Set([...Object.keys(completeDateById), ...Object.keys(claimDeniedDateById)]))
  const openIds     = openClaims.map(   (c) => (c as unknown as unknown as R).id as string)
  const pendingIds  = pendingClaims.map((c) => (c as unknown as unknown as R).id as string)
  const allIds      = Array.from(new Set([...openIds, ...pendingIds, ...terminalIds]))

  // ── Wave 2: terminal claims + enrichment data ──────────────────────────────

  const [termClaimsRes, { data: estData }, { data: payData }] = await Promise.all([
    terminalIds.length > 0
      ? sb.from('claims').select(`${CLAIM_COLS}, claim_denied`).in('id', terminalIds)
      : emptyFetch(),

    allIds.length > 0
      ? sb
          .from('estimates')
          .select('claim_id, adjuster_fees, estimate_total, contractor_name')
          .in('claim_id', allIds)
      : emptyFetch(),

    allIds.length > 0
      ? sb
          .from('claim_payments')
          .select('claim_id, amount, payment_type, incoming_or_outgoing')
          .in('claim_id', allIds)
      : emptyFetch(),
  ])

  if (termClaimsRes.error) {
    return NextResponse.json({ error: `termClaims: ${termClaimsRes.error.message}` }, { status: 500 })
  }

  // Build estimate map: claim_id → MAX(estimate_total), SUM(adjuster_fees)
  const estMap: Record<string, EstSummary> = {}
  for (const e of estData ?? []) {
    const r   = e as R
    const cid = r.claim_id as string | null
    if (!cid) continue
    const et  = (r.estimate_total  as number | null) ?? 0
    const af  = (r.adjuster_fees   as number | null) ?? 0
    const cn  = (r.contractor_name as string | null)
    const prev = estMap[cid]
    estMap[cid] = prev
      ? { estimate_total: Math.max(prev.estimate_total, et), adjuster_fees: prev.adjuster_fees + af, contractor_name: prev.contractor_name ?? cn }
      : { estimate_total: et, adjuster_fees: af, contractor_name: cn }
  }

  // Build payment map: claim_id → billing_value / sf_collected / ded_collected
  // billing_value = ALL outgoing Claim Payout rows (per Excel spec — includes Claim Adjusters)
  const payMap: Record<string, PaySummary> = {}
  for (const p of payData ?? []) {
    const r   = p as unknown as R
    const cid = r.claim_id as string | null
    if (!cid) continue
    if (!payMap[cid]) payMap[cid] = { billing_value: 0, sf_collected: 0, ded_collected: 0 }
    const amt = (r.amount as number | null) ?? 0
    if (r.payment_type === 'Claim Payout' && r.incoming_or_outgoing === 'Outgoing') payMap[cid].billing_value += amt
    if (r.payment_type === 'Service Fee'  && r.incoming_or_outgoing === 'Incoming') payMap[cid].sf_collected  += amt
    if (r.payment_type === 'Deductible'   && r.incoming_or_outgoing === 'Incoming') payMap[cid].ded_collected += amt
  }

  // ── Row builder ───────────────────────────────────────────────────────────

  function buildRow(c: R, refDateIso: string, closeDate: string | null = null): ClaimRow {
    const cid      = c.id as string
    const est      = estMap[cid] ?? { estimate_total: 0, adjuster_fees: 0, contractor_name: null }
    const pay      = payMap[cid] ?? { billing_value: 0, sf_collected: 0, ded_collected: 0 }
    const daysOpen = daysBetween(c.created_time as string | null, closeDate ?? refDateIso)
    return {
      id:                   cid,
      field_service_number: (c.field_service_number as string | null) ?? null,
      deal_name:            (c.deal_name            as string | null) ?? null,
      stage:                (c.stage                as string | null) ?? null,
      claim_status:         (c.claim_status         as string | null) ?? null,
      tank_type:            (c.tank_type            as string | null) ?? null,
      claim_trigger:        (c.claim_trigger        as string | null) ?? null,
      contact_name:         (c.contact_name         as string | null) ?? null,
      city:                 (c.city                 as string | null) ?? null,
      claim_state:          (c.claim_state          as string | null) ?? null,
      owner_name:           (c.owner_name           as string | null) ?? null,
      created_time:         (c.created_time         as string | null) ?? null,
      close_date:           closeDate,
      days_open:            daysOpen,
      aging:                agingBucket(daysOpen),
      estimate_total:       est.estimate_total,
      adjuster_fees:        est.adjuster_fees,
      contractor_name:      est.contractor_name,
      billing_value:        pay.billing_value,
      sf_collected:         pay.sf_collected,
      ded_collected:        pay.ded_collected,
      net_incurred:         pay.billing_value + est.adjuster_fees - pay.sf_collected - pay.ded_collected,
    }
  }

  // ── Section 1: Open Claims ────────────────────────────────────────────────

  const openRows = openClaims
    .map((c) => buildRow(c as unknown as R, asOf))
    .sort((a, b) => b.days_open - a.days_open)

  const openTotals = {
    estimate_total: openRows.reduce((s, r) => s + r.estimate_total, 0),
    adjuster_fees:  openRows.reduce((s, r) => s + r.adjuster_fees,  0),
    billing_value:  openRows.reduce((s, r) => s + r.billing_value,  0),
    sf_collected:   openRows.reduce((s, r) => s + r.sf_collected,   0),
    ded_collected:  openRows.reduce((s, r) => s + r.ded_collected,  0),
    net_incurred:   openRows.reduce((s, r) => s + r.net_incurred,   0),
  }

  // ── Section 2: Closed This Week ───────────────────────────────────────────
  // Claims with a 'Complete' event in the window AND not denied (ast_denied / ust_closed+claim_denied)

  const closedRows = (termClaimsRes.data ?? [])
    .filter((c) => {
      const r      = c as unknown as R
      const cid    = r.id as string
      const status = r.claim_status as string | null
      return (
        completeDateById[cid] &&
        status !== 'ast_denied' &&
        !(status === 'ust_closed' && r.claim_denied === true)
      )
    })
    .map((c) => {
      const r = c as R
      return buildRow(r, asOf, completeDateById[r.id as string])
    })
    .sort((a, b) => (b.close_date ?? '').localeCompare(a.close_date ?? ''))

  // ── Section 3: Denied This Week ──────────────────────────────────────────

  const deniedRows: DeniedRow[] = []

  for (const c of termClaimsRes.data ?? []) {
    const r      = c as unknown as R
    const cid    = r.id as string
    const status = r.claim_status as string | null
    if (!claimDeniedDateById[cid]) continue
    if (status !== 'ast_denied' && !(status === 'ust_closed' && r.claim_denied === true)) continue
    deniedRows.push({
      id:                   cid,
      field_service_number: (r.field_service_number as string | null) ?? null,
      contact_name:         (r.contact_name         as string | null) ?? null,
      stage:                (r.stage                as string | null) ?? null,
      claim_trigger:        (r.claim_trigger        as string | null) ?? null,
      tank_type:            (r.tank_type            as string | null) ?? null,
      close_date:           claimDeniedDateById[cid],
      manual:               false,
    })
  }

  // Append manual denials from report_manual_denials
  for (const md of manualDenialsRes.data ?? []) {
    const r = md as unknown as R
    deniedRows.push({
      id:                   (r.id as string) ?? '',
      field_service_number: (r.claim_reference as string | null) ?? null,
      contact_name:         (r.contact_name    as string | null) ?? null,
      stage:                null,
      claim_trigger:        (r.trigger         as string | null) ?? null,
      tank_type:            (r.tank_type       as string | null) ?? null,
      close_date:           (r.denial_date     as string | null) ?? null,
      manual:               true,
    })
  }

  deniedRows.sort((a, b) => (b.close_date ?? '').localeCompare(a.close_date ?? ''))

  // ── Section 4: New Claims This Week ──────────────────────────────────────

  const newRows: ClaimRow[] = []
  const seenNew = new Set<string>()

  // Source a: created within the week window (open claims that started this week)
  for (const c of openClaims) {
    const r   = c as unknown as R
    const cid = r.id as string
    const ct  = r.created_time as string | null
    if (ct) {
      const ctMs = new Date(ct).getTime()
      if (ctMs >= weekStartMs && ctMs <= asOfMs && !seenNew.has(cid)) {
        seenNew.add(cid)
        newRows.push(buildRow(r, asOf))
      }
    }
  }

  // Source b: graduated from pending pull (present in prior snapshots, now open)
  for (const c of openClaims) {
    const r   = c as unknown as R
    const cid = r.id as string
    const fsn = r.field_service_number as string | null
    if (fsn && priorSnapshotFsns.has(fsn) && !seenNew.has(cid)) {
      seenNew.add(cid)
      newRows.push(buildRow(r, asOf))
    }
  }

  newRows.sort((a, b) => (b.created_time ?? '').localeCompare(a.created_time ?? ''))

  // ── Section 5: Pending UST Pulls ─────────────────────────────────────────

  const pendingRows = pendingClaims
    .map((c) => buildRow(c as unknown as R, asOf))
    .sort((a, b) => b.days_open - a.days_open)

  // Upsert current pending FSNs to snapshot table so next week can detect graduates
  if (pendingClaims.length > 0) {
    const snapRows = pendingClaims
      .map((c) => {
        const r   = c as unknown as R
        const fsn = r.field_service_number as string | null
        if (!fsn) return null
        return {
          snapshot_date:        asOf,
          field_service_number: fsn,
          stage:                (r.stage         as string | null) ?? null,
          contact_name:         (r.contact_name  as string | null) ?? null,
          claim_trigger:        (r.claim_trigger as string | null) ?? null,
          tank_type:            (r.tank_type     as string | null) ?? null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (snapRows.length > 0) {
      await sb
        .from('pending_pull_snapshots')
        .upsert(snapRows, { onConflict: 'snapshot_date,field_service_number' })
    }
  }

  // ── KPI Header ────────────────────────────────────────────────────────────

  const triggerCounts: Record<string, number> = {}
  for (const r of openRows) {
    if (r.claim_trigger) triggerCounts[r.claim_trigger] = (triggerCounts[r.claim_trigger] ?? 0) + 1
  }
  const topEntry = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])[0]

  const kpis = {
    open_count:          openRows.length,
    net_total_incurred:  openTotals.net_incurred,
    total_adj_fees:      openTotals.adjuster_fees,
    avg_net_per_claim:   openRows.length > 0 ? Math.round(openTotals.net_incurred / openRows.length) : 0,
    avg_days_open:       openRows.length > 0 ? Math.round(openRows.reduce((s, r) => s + r.days_open, 0) / openRows.length) : 0,
    claims_180_plus:     openRows.filter((r) => r.days_open >= 180).length,
    claims_under_90:     openRows.filter((r) => r.days_open < 90).length,
    total_billing_value: openTotals.billing_value,
    top_trigger:         topEntry ? { trigger: topEntry[0], count: topEntry[1] } : null,
    closed_last_week:    closedRows.length,
  }

  // ── Exclusions list (full detail for UI manager) ──────────────────────────

  const { data: exclusionDetail } = await sb
    .from('report_exclusions')
    .select('field_service_number, reason, added_at')
    .order('added_at', { ascending: false })

  // ── Response ──────────────────────────────────────────────────────────────

  return NextResponse.json({
    as_of:                asOf,
    week_start:           weekStart,
    week_end:             asOf,
    kpis,
    open_totals:          openTotals,
    open_claims:          openRows,
    closed_this_week:     closedRows,
    denied_this_week:     deniedRows,
    new_claims_this_week: newRows,
    pending_ust_pulls:    pendingRows,
    exclusions:           exclusionDetail ?? [],
  })
}
