import { NextRequest, NextResponse } from 'next/server'
import { DELETE as mdDEL } from '../../../report-manual-denials/[id]/route'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const url = new URL(`/api/report-manual-denials/${params.id}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(url, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  try {
    return await mdDEL(proxyReq, { params })
  } catch (err) {
    console.error('[internal/report-manual-denials DELETE] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
