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

  const { data, error } = await sb
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
    .order('modified_time', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ claims: data ?? [], total: (data ?? []).length })
}
