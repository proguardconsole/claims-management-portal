import { NextRequest, NextResponse } from 'next/server'
import { GET as reportGET } from '../../report/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/report${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return reportGET(proxyReq)
}
