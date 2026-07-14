import { NextRequest, NextResponse } from 'next/server'
import { GET as narrativeGET } from '../../../digest/narrative/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  url.pathname = '/api/digest/narrative'
  const proxyReq = new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return narrativeGET(proxyReq)
}
