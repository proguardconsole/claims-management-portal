import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

function authOk(req: NextRequest): boolean {
  return req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('report_manual_denials')
    .select('id, claim_reference, contact_name, trigger, tank_type, denial_date, notes, added_by')
    .order('denial_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json() as {
    claim_reference: string
    contact_name?: string
    trigger?: string
    tank_type?: string
    denial_date: string
    notes?: string
    added_by?: string
  }
  if (!body.claim_reference || !body.denial_date) {
    return NextResponse.json({ error: 'claim_reference and denial_date required' }, { status: 400 })
  }
  const sb = getServerSupabase()
  const { error } = await sb.from('report_manual_denials').insert({
    claim_reference: body.claim_reference.trim(),
    contact_name:    body.contact_name ?? null,
    trigger:         body.trigger      ?? null,
    tank_type:       body.tank_type    ?? null,
    denial_date:     body.denial_date,
    notes:           body.notes        ?? null,
    added_by:        body.added_by     ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
