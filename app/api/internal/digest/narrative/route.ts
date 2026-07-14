import { NextRequest, NextResponse } from 'next/server'
import { GET as narrativeGET } from '../../../digest/narrative/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/digest/narrative${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return narrativeGET(proxyReq)
}
