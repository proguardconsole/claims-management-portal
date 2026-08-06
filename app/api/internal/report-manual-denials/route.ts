import { NextRequest, NextResponse } from 'next/server'
import { GET as mdGET, POST as mdPOST } from '../../report-manual-denials/route'

async function proxy(req: NextRequest): Promise<NextRequest> {
  const url = new URL(`/api/report-manual-denials${req.nextUrl.search}`, req.nextUrl.origin)
  const bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
  return new NextRequest(url, {
    method:  req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body:    bodyText,
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return mdGET(await proxy(req))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return mdPOST(await proxy(req))
}
