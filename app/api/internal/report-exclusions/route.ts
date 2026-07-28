import { NextRequest, NextResponse } from 'next/server'
import { GET as excGET, POST as excPOST } from '../../report-exclusions/route'

function proxy(req: NextRequest, path: string): NextRequest {
  const url = new URL(`/api/report-exclusions${path}${req.nextUrl.search}`, req.nextUrl.origin)
  return new NextRequest(url, {
    method:  req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body:    req.body,
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return excGET(proxy(req, ''))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return excPOST(proxy(req, ''))
}
