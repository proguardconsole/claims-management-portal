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
  return mdDEL(proxyReq, { params })
}
