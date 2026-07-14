import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

const CLOSED_STATUSES = ['ast_completed', 'ust_closed', 'ast_denied'] as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getServerSupabase()
  const p = req.nextUrl.searchParams

  const filter   = p.get('filter') ?? 'all'   // 'all' | 'closed' | 'denied'
  const tankType = p.get('tank_type')          // 'AST' | 'UST' | null
  const search   = p.get('search')
  const limit    = Math.min(parseInt(p.get('limit') ?? '500', 10), 500)
  const offset   = parseInt(p.get('offset') ?? '0', 10)

  let query = sb
    .from('claims')
    .select(
      `id, field_service_number, deal_name, stage, claim_status, claim_denied,
       claim_denied_reason, tank_type, record_type, owner_name, adjuster_name,
       city, claim_state, date_claim_is_reported, modified_time, modified_by_name,
       contact_name, claim_contact_phone, account_name, description, claim_trigger`,
    )
    .eq('record_type', 'Claim')
    .in('claim_status', [...CLOSED_STATUSES])
    .order('modified_time', { ascending: false })
    .range(offset, offset + limit - 1)

  // Denied = stage is 'Claim Denied'; closed = everything else in CLOSED_STATUSES
  if (filter === 'denied') {
    query = query.eq('stage', 'Claim Denied')
  } else if (filter === 'closed') {
    query = query.neq('stage', 'Claim Denied')
  }

  if (tankType) {
    query = query.eq('tank_type', tankType)
  }

  if (search) {
    query = query.or(
      `field_service_number.ilike.%${search}%,contact_name.ilike.%${search}%,city.ilike.%${search}%,deal_name.ilike.%${search}%`,
    )
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const claims = data ?? []
  const closed = claims.filter((c) => c.stage !== 'Claim Denied').length
  const denied = claims.filter((c) => c.stage === 'Claim Denied').length

  return NextResponse.json({ claims, total: claims.length, closed, denied })
}
