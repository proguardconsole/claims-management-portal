import { NextRequest, NextResponse } from 'next/server'
import { GET as analyticsGET } from '../../analytics/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  url.pathname = '/api/analytics'
  const proxyReq = new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return analyticsGET(proxyReq)
}
