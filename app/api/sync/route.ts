import { NextRequest, NextResponse } from 'next/server'
import { syncClaims } from '../../../lib/sync/syncClaims'
import { syncCallLogs } from '../../../lib/sync/syncCallLogs'

async function handleSync(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()

  try {
    await Promise.all([syncClaims(), syncCallLogs()])

    return NextResponse.json({
      success: true,
      elapsed_ms: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET — called by Vercel cron scheduler
export async function GET(req: NextRequest) {
  return handleSync(req)
}

// POST — for manual triggering
export async function POST(req: NextRequest) {
  return handleSync(req)
}
