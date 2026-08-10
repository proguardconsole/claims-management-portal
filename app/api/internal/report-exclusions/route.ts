import { NextRequest, NextResponse } from 'next/server'
import { GET as excGET, POST as excPOST } from '../../report-exclusions/route'

async function proxy(req: NextRequest, path: string): Promise<NextRequest> {
  const url = new URL(`/api/report-exclusions${path}${req.nextUrl.search}`, req.nextUrl.origin)
  const bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
  console.log('[internal/report-exclusions proxy] method=%s url=%s bodyText=%s',
    req.method, url.toString(), bodyText?.slice(0, 500) ?? '(none)')
  return new NextRequest(url, {
    method:  req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body:    bodyText,
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return excGET(await proxy(req, ''))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return excPOST(await proxy(req, ''))
}
