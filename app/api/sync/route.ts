import { NextRequest, NextResponse } from 'next/server'
import { syncClaims } from '../../../lib/sync/syncClaims'
import { syncCallLogs } from '../../../lib/sync/syncCallLogs'
import { syncEstimates } from '../../../lib/sync/syncEstimates'
import { syncPayments } from '../../../lib/sync/syncPayments'

async function handleSync(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()

  try {
    // Sequential execution to respect Zoho API rate limits
    console.log('\n[sync] syncClaims starting...')
    const claimsStart = Date.now()
    await syncClaims()
    const claimsElapsed = Date.now() - claimsStart

    console.log('\n[sync] syncCallLogs starting...')
    const callLogsStart = Date.now()
    await syncCallLogs()
    const callLogsElapsed = Date.now() - callLogsStart

    console.log('\n[sync] syncEstimates starting...')
    const estimatesResult = await syncEstimates()

    console.log('\n[sync] syncPayments starting...')
    const paymentsResult = await syncPayments()

    return NextResponse.json({
      success: true,
      elapsed_ms: Date.now() - start,
      claims:    { elapsed_ms: claimsElapsed },
      call_logs: { elapsed_ms: callLogsElapsed },
      estimates: estimatesResult,
      payments:  paymentsResult,
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
