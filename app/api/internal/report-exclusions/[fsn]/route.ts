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
  return excDEL(proxyReq, { params })
}
