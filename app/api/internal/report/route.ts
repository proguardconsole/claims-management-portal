import { NextRequest, NextResponse } from 'next/server'
import { GET as reportGET } from '../../report/route'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/report${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  const res = await reportGET(proxyReq)
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}
