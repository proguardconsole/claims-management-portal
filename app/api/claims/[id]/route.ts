import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const claimId = params.id
  const sb = getServerSupabase()

  const [historyRes, claimRes] = await Promise.all([
    sb
      .from('claim_events')
      .select('stage, entered_at, days_in_stage, modified_by_name')
      .eq('claim_id', claimId)
      .order('entered_at', { ascending: true }),
    sb
      .from('claims')
      .select('claim_contact_phone')
      .eq('id', claimId)
      .single(),
  ])

  const history = historyRes.data ?? []
  const phone = claimRes.data?.claim_contact_phone ?? null

  let calls: Record<string, unknown>[] = []
  if (phone) {
    const digits = phone.replace(/\D/g, '').slice(-10)
    const { data: callData } = await sb
      .from('call_logs')
      .select('direction, call_time, duration_seconds, phone_number, agent_name')
      .or(
        `phone_number.ilike.%${digits}%,src_number.ilike.%${digits}%,dst_number.ilike.%${digits}%`,
      )
      .order('call_time', { ascending: false })
      .limit(10)
    calls = callData ?? []
  }

  return NextResponse.json({ history, calls, phone })
}
