import { NextRequest, NextResponse } from 'next/server'
import { GET as claimsIdGET } from '../../../claims/[id]/route'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const proxyUrl = new URL(`/api/claims/${params.id}${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(proxyUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return claimsIdGET(proxyReq, { params })
}
