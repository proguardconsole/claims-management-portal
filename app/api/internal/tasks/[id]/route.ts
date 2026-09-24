import { NextRequest, NextResponse } from 'next/server'
import { GET as taskGET, PATCH as taskPATCH, DELETE as taskDEL } from '../../../tasks/[id]/route'

async function proxy(req: NextRequest, id: string): Promise<NextRequest> {
  const url = new URL(`/api/tasks/${id}`, req.nextUrl.origin)
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    return await taskGET(await proxy(req, params.id), { params })
  } catch (err) {
    console.error('[internal/tasks/[id] GET] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    return await taskPATCH(await proxy(req, params.id), { params })
  } catch (err) {
    console.error('[internal/tasks/[id] PATCH] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    return await taskDEL(await proxy(req, params.id), { params })
  } catch (err) {
    console.error('[internal/tasks/[id] DELETE] unhandled error:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
