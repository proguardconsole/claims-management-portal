import { NextRequest, NextResponse } from 'next/server'
import { syncClaims } from '../../../lib/sync/syncClaims'
import { syncCallLogs } from '../../../lib/sync/syncCallLogs'
import { syncEstimates } from '../../../lib/sync/syncEstimates'
import { syncPayments } from '../../../lib/sync/syncPayments'
import { syncInspections } from '../../../lib/sync/syncInspections'
import { syncStageHistory } from '../../../lib/sync/syncStageHistory'

async function runSync(): Promise<NextResponse> {
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

    console.log('\n[sync] syncInspections starting...')
    const inspectionsResult = await syncInspections()

    console.log('\n[sync] syncStageHistory starting...')
    const stageHistoryResult = await syncStageHistory()

    return NextResponse.json({
      success: true,
      elapsed_ms: Date.now() - start,
      claims:        { elapsed_ms: claimsElapsed },
      call_logs:     { elapsed_ms: callLogsElapsed },
      estimates:     estimatesResult,
      payments:      paymentsResult,
      inspections:   inspectionsResult,
      stage_history: stageHistoryResult,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET — called by Vercel cron scheduler.
// Accepts either a valid CRON_SECRET bearer token (manual trigger)
// or the x-vercel-cron: 1 header that Vercel injects on Hobby plan.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-vercel-cron')
  const token = authHeader?.replace('Bearer ', '').trim()
  const validManual = token === process.env.CRON_SECRET
  const validCron = cronHeader === '1'

  if (!validManual && !validCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runSync()
}

// POST — for manual triggering, requires CRON_SECRET bearer token.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return runSync()
}
