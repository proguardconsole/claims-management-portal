import { NextRequest, NextResponse } from 'next/server'
import { GET as excGET, POST as excPOST } from '../../report-exclusions/route'

async function proxy(req: NextRequest, path: string): Promise<NextRequest> {
  const url = new URL(`/api/report-exclusions${path}${req.nextUrl.search}`, req.nextUrl.origin)
  // Drain the body to a string before constructing the new request — passing req.body
  // (a ReadableStream) directly is unreliable in Next.js 14 serverless and often arrives
  // as an empty stream at the downstream handler.
  const bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
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
