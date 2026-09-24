import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'
import { cronAuthOk } from '../../../../lib/secureCompare'

function authOk(req: NextRequest): boolean {
  return cronAuthOk(req.headers.get('Authorization'))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = getServerSupabase()
  const { error } = await sb.from('report_manual_denials').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
