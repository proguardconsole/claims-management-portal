import { NextRequest, NextResponse } from 'next/server'
import { GET as staleGET, POST as stalePOST } from '../../stale-claims/route'

const bearer = () => process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/stale-claims${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${bearer()}` },
  })
  return staleGET(proxyReq)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const proxyUrl = new URL('/api/stale-claims', req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${bearer()}`,
      'Content-Type': 'application/json',
    },
    body: rawBody,
  })
  return stalePOST(proxyReq)
}
