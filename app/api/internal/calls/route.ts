import { NextRequest, NextResponse } from 'next/server'
import { GET as callsGET } from '../../calls/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  url.pathname = '/api/calls'
  const proxyReq = new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return callsGET(proxyReq)
}
