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
  try {
    return await mdGET(await proxy(req))
  } catch (err) {
    console.error('[internal/report-manual-denials GET] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    return await mdPOST(await proxy(req))
  } catch (err) {
    console.error('[internal/report-manual-denials POST] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
