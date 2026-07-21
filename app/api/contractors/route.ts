import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ['ast_open', 'ust_open', 'ust_pre_tank'] as const

// ── types ──────────────────────────────────────────────────────────────────────

type ClaimEntry = {
  field_service_number: string
  deal_name: string
  stage: string
  tank_type: string
  owner_name: string
  estimate_total: number
  payment_total: number
}

type ContractorAgg = {
  claimIds: Set<string>
  claimsMap: Record<string, ClaimEntry>
  total_estimated: number
  total_paid: number
}

// ── route ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getServerSupabase()

  // 1. All open claims (lightweight — just what we need for the table)
  const { data: claimsData, error: claimsErr } = await sb
    .from('claims')
    .select('id, field_service_number, deal_name, stage, tank_type, claim_status, owner_name')
    .in('claim_status', [...OPEN_STATUSES])

  if (claimsErr) {
    return NextResponse.json({ error: claimsErr.message }, { status: 500 })
  }

  const claimList = claimsData ?? []
  const ids = claimList.map((c) => c.id)

  if (ids.length === 0) {
    return NextResponse.json({ contractors: [] })
  }

  // 2 & 3. Estimates + payments for those claims in parallel
  const [{ data: estRows, error: estErr }, { data: payRows, error: payErr }] = await Promise.all([
    sb
      .from('estimates')
      .select('claim_id, contractor_name, contractor_costs, estimate_total')
      .in('claim_id', ids)
      .not('contractor_name', 'is', null),
    sb
      .from('claim_payments')
      .select('claim_id, amount')
      .in('claim_id', ids),
  ])

  if (estErr) return NextResponse.json({ error: estErr.message }, { status: 500 })
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Index claims by id for O(1) lookups
  const claimById: Record<string, typeof claimList[0]> = {}
  for (const c of claimList) {
    claimById[c.id] = c
  }

  // Payment totals per claim
  const paymentMap: Record<string, number> = {}
  for (const p of payRows ?? []) {
    if (p.claim_id) {
      paymentMap[p.claim_id] = (paymentMap[p.claim_id] ?? 0) + ((p.amount as number) ?? 0)
    }
  }

  // Group estimates by contractor_name
  const agg: Record<string, ContractorAgg> = {}

  for (const e of estRows ?? []) {
    const name = e.contractor_name as string | null
    if (!name) continue

    const claimId = e.claim_id as string | null
    if (!claimId) continue

    const claim = claimById[claimId]
    if (!claim) continue

    if (!agg[name]) {
      agg[name] = { claimIds: new Set(), claimsMap: {}, total_estimated: 0, total_paid: 0 }
    }

    const bucket = agg[name]

    // First time we see this claim under this contractor
    if (!bucket.claimIds.has(claimId)) {
      bucket.claimIds.add(claimId)
      const paid = paymentMap[claimId] ?? 0
      bucket.claimsMap[claimId] = {
        field_service_number: (claim.field_service_number as string) ?? '',
        deal_name:            (claim.deal_name as string) ?? '',
        stage:                (claim.stage as string) ?? '',
        tank_type:            (claim.tank_type as string) ?? '',
        owner_name:           (claim.owner_name as string) ?? '',
        estimate_total:       0,
        payment_total:        paid,
      }
      bucket.total_paid += paid
    }

    const est = (e.estimate_total as number) ?? 0
    bucket.claimsMap[claimId].estimate_total += est
    bucket.total_estimated += est
  }

  // Flatten and sort by total_estimated DESC
  const contractors = Object.entries(agg)
    .map(([contractor_name, bucket]) => ({
      contractor_name,
      claim_count:     bucket.claimIds.size,
      claims:          Object.values(bucket.claimsMap),
      total_estimated: Math.round(bucket.total_estimated * 100) / 100,
      total_paid:      Math.round(bucket.total_paid * 100) / 100,
    }))
    .sort((a, b) => b.total_estimated - a.total_estimated)

  return NextResponse.json({ contractors })
}
