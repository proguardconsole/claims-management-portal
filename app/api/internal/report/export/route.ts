import { NextRequest, NextResponse } from 'next/server'
import { GET as exportGET } from '../../../report/export/route'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(`/api/report/export${req.nextUrl.search}`, req.nextUrl.origin)
  const proxyReq = new NextRequest(url, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  return exportGET(proxyReq)
}
