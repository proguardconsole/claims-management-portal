import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

const OPEN_STATUSES = ['ast_open', 'ust_open', 'ust_pre_tank'] as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getServerSupabase()
  const p  = req.nextUrl.searchParams

  // Meta endpoint — returns distinct option lists for filter dropdowns
  if (p.get('meta') === '1') {
    const { data: meta, error: metaErr } = await sb
      .from('claims')
      .select('owner_name, account_name, stage, claim_trigger')
      .in('claim_status', [...OPEN_STATUSES])
    if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 })
    const ownersMap: Record<string, true>   = {}
    const dealersMap: Record<string, true>  = {}
    const stagesMap: Record<string, true>   = {}
    const triggersMap: Record<string, true> = {}
    for (const r of meta ?? []) {
      if (r.owner_name)    ownersMap[r.owner_name]      = true
      if (r.account_name)  dealersMap[r.account_name]   = true
      if (r.stage)         stagesMap[r.stage]            = true
      if (r.claim_trigger) triggersMap[r.claim_trigger]  = true
    }
    return NextResponse.json({
      owners:     Object.keys(ownersMap).sort(),
      oilDealers: Object.keys(dealersMap).sort(),
      stages:     Object.keys(stagesMap).sort(),
      triggers:   Object.keys(triggersMap).sort(),
    })
  }

  const SORT_MAP: Record<string, { col: string; asc: boolean }> = {
    updated_desc:  { col: 'modified_time',          asc: false },
    updated_asc:   { col: 'modified_time',          asc: true  },
    reported_desc: { col: 'date_claim_is_reported', asc: false },
    reported_asc:  { col: 'date_claim_is_reported', asc: true  },
    fsn_asc:       { col: 'field_service_number',   asc: true  },
  }
  const sort      = p.get('sort') ?? 'updated_desc'
  const { col, asc } = SORT_MAP[sort] ?? SORT_MAP['updated_desc']

  let query = sb
    .from('claims')
    .select(
      `id, field_service_number, deal_name, stage, claim_status,
       tank_type, owner_name, adjuster_name, city, claim_state,
       date_claim_is_reported, modified_time, modified_by_name,
       emergency, claim_denied, claim_denied_reason,
       total_claim_costs, total_amount_paid,
       contact_name, claim_contact_phone, account_name,
       proceed_to_remediation, record_type, claim_trigger, description`,
    )
    .in('claim_status', [...OPEN_STATUSES])
    .order(col, { ascending: asc })

  const owner     = p.get('owner')
  const oilDealer = p.get('oil_dealer')
  const stage     = p.get('stage')
  const trigger   = p.get('trigger')
  const dateFrom  = p.get('date_from')
  const dateTo    = p.get('date_to')

  if (owner)     query = query.eq('owner_name', owner)
  if (oilDealer) query = query.eq('account_name', oilDealer)
  if (stage)     query = query.eq('stage', stage)
  if (trigger)   query = query.eq('claim_trigger', trigger)
  if (dateFrom)  query = query.gte('date_claim_is_reported', dateFrom)
  if (dateTo)    query = query.lte('date_claim_is_reported', dateTo)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const claims = data ?? []
  const ids = claims.map((c) => c.id)

  const [{ data: estRows }, { data: payRows }] = await Promise.all([
    ids.length > 0
      ? sb
          .from('estimates')
          .select('claim_id, contractor_name, estimate_total')
          .in('claim_id', ids)
      : Promise.resolve({
          data: [] as {
            claim_id: string
            contractor_name: string | null
            estimate_total: number | null
          }[],
        }),
    ids.length > 0
      ? sb.from('claim_payments').select('claim_id, amount').in('claim_id', ids)
      : Promise.resolve({ data: [] as { claim_id: string; amount: number | null }[] }),
  ])

  const estimateMap: Record<string, number> = {}
  const contractorMap: Record<string, string> = {}
  for (const e of estRows ?? []) {
    if (e.claim_id) {
      estimateMap[e.claim_id] = (estimateMap[e.claim_id] ?? 0) + (e.estimate_total ?? 0)
      if (!contractorMap[e.claim_id] && e.contractor_name) {
        contractorMap[e.claim_id] = e.contractor_name
      }
    }
  }
  const paymentMap: Record<string, number> = {}
  for (const p of payRows ?? []) {
    if (p.claim_id) paymentMap[p.claim_id] = (paymentMap[p.claim_id] ?? 0) + (p.amount ?? 0)
  }

  const enriched = claims.map((c) => ({
    ...c,
    estimate_total: estimateMap[c.id] ?? 0,
    payment_total: paymentMap[c.id] ?? 0,
    contractor_name: contractorMap[c.id] ?? null,
  }))

  return NextResponse.json({ claims: enriched, total: enriched.length })
}
