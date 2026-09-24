import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'
import { cronAuthOk } from '../../../lib/secureCompare'

function authOk(req: NextRequest): boolean {
  return cronAuthOk(req.headers.get('Authorization'))
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('report_exclusions')
    .select('field_service_number, reason, added_at')
    .order('added_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { field_service_number: string; reason?: string; added_by?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.field_service_number) return NextResponse.json({ error: 'field_service_number required' }, { status: 400 })
  const sb = getServerSupabase()
  const { error } = await sb.from('report_exclusions').insert({
    field_service_number: body.field_service_number.trim().toUpperCase(),
    reason:   body.reason   ?? null,
    added_by: body.added_by ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
