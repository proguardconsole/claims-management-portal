import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

function authOk(req: NextRequest): boolean {
  return req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
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
  if (!authOk(req)) {
    console.log('[report-exclusions POST] auth FAILED')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { field_service_number: string; reason?: string; added_by?: string }
  try {
    body = await req.json() as typeof body
  } catch (e) {
    console.error('[report-exclusions POST] req.json() threw:', e, '| content-type:', req.headers.get('content-type'))
    return NextResponse.json({ error: `body parse error: ${String(e)}` }, { status: 400 })
  }
  console.log('[report-exclusions POST] body:', JSON.stringify(body))
  if (!body.field_service_number) return NextResponse.json({ error: 'field_service_number required' }, { status: 400 })
  const sb = getServerSupabase()
  const { error } = await sb.from('report_exclusions').insert({
    field_service_number: body.field_service_number.trim().toUpperCase(),
    reason:   body.reason   ?? null,
    added_by: body.added_by ?? null,
  })
  if (error) {
    console.error('[report-exclusions POST] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  console.log('[report-exclusions POST] insert OK')
  return NextResponse.json({ ok: true })
}
