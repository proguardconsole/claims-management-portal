import { NextRequest, NextResponse } from 'next/server'
import { GET as analyticsGET } from '../../analytics/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/analytics${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return analyticsGET(proxyReq)
}
