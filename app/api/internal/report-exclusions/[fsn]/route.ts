import { NextRequest, NextResponse } from 'next/server'
import { DELETE as excDEL } from '../../../report-exclusions/[fsn]/route'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { fsn: string } }
): Promise<NextResponse> {
  const url = new URL(`/api/report-exclusions/${params.fsn}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(url, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  try {
    return await excDEL(proxyReq, { params })
  } catch (err) {
    console.error('[internal/report-exclusions DELETE] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
