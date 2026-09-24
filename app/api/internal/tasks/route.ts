import { NextRequest, NextResponse } from 'next/server'
import { GET as tasksGET, POST as tasksPOST } from '../../tasks/route'

async function proxy(req: NextRequest): Promise<NextRequest> {
  const url = new URL(`/api/tasks${req.nextUrl.search}`, req.nextUrl.origin)
  const bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
  return new NextRequest(url, {
    method:  req.method,
    headers: { ...Object.fromEntries(req.headers), Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body:    bodyText,
    // duplex is required by undici for any body-bearing Request construction
    ...(bodyText !== undefined && { duplex: 'half' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await tasksGET(await proxy(req))
  } catch (err) {
    console.error('[internal/tasks GET] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    return await tasksPOST(await proxy(req))
  } catch (err) {
    console.error('[internal/tasks POST] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
