import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'
import { cronAuthOk } from '../../../../lib/secureCompare'

function authOk(req: NextRequest): boolean {
  return cronAuthOk(req.headers.get('Authorization'))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { fsn: string } }
): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const fsn = decodeURIComponent(params.fsn)
  const sb = getServerSupabase()
  const { error } = await sb.from('report_exclusions').delete().eq('field_service_number', fsn)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
