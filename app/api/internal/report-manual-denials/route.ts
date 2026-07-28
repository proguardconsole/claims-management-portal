import { NextRequest, NextResponse } from 'next/server'
import { GET as mdGET, POST as mdPOST } from '../../report-manual-denials/route'

function proxy(req: NextRequest): NextRequest {
  const url = new URL(`/api/report-manual-denials${req.nextUrl.search}`, req.nextUrl.origin)
  return new NextRequest(url, {
    method:  req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body:    req.body,
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return mdGET(proxy(req))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return mdPOST(proxy(req))
}
