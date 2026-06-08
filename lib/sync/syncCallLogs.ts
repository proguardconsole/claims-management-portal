import { createClient } from '@supabase/supabase-js'
import { threeCXClient } from '../3cx/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UPSERT_BATCH_SIZE = 200
const LOOKBACK_DAYS = 90
// CallHistoryView does not support $filter on this 3CX deployment (returns 500).
// Fetch the most recent N records ordered desc and apply a client-side date guard.
const MAX_FETCH = 5000

type ThreeCXRecord = Record<string, unknown>

// Converts ISO 8601 duration e.g. PT34.765S or PT1M23.4S → integer seconds
export function parseISODuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/)
  if (!match) return 0
  const minutes = parseInt(match[1] ?? '0', 10)
  const seconds = parseFloat(match[2] ?? '0')
  return minutes * 60 + Math.floor(seconds)
}

// Returns 'inbound' if the call originated externally, 'outbound' if it terminated externally
export function detectDirection(record: ThreeCXRecord): 'inbound' | 'outbound' {
  if (record.SrcExternal === true) return 'inbound'
  if (record.DstExternal === true) return 'outbound'
  return 'inbound' // fallback
}

// Returns true if the call time falls outside 08:00–18:00 ET, or on a weekend
function isAfterHours(segmentStartTime: string): boolean {
  const date = new Date(segmentStartTime)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    hour: 'numeric',
    weekday: 'short',
  }).formatToParts(date)

  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '12', 10)
  const weekday = parts.find((p) => p.type === 'weekday')?.value

  return weekday === 'Sat' || weekday === 'Sun' || hour < 8 || hour >= 18
}

function mapRecord(record: ThreeCXRecord, syncedAt: string) {
  const segmentId = record.SegmentId as number
  const segmentStartTime = record.SegmentStartTime as string
  const direction = detectDirection(record)
  return {
    id: String(segmentId),
    segment_id: segmentId,
    call_time: segmentStartTime,
    duration_seconds: parseISODuration(typeof record.CallTime === 'string' ? record.CallTime : 'PT0S'),
    direction,
    phone_number: record.SrcExternal ? record.SrcCallerNumber as string : record.DstCallerNumber as string,
    agent_name: record.SrcInternal ? record.SrcDisplayName as string : record.DstDisplayName as string,
    src_number: record.SrcCallerNumber as string ?? null,
    dst_number: record.DstCallerNumber as string ?? null,
    src_internal: record.SrcInternal as boolean ?? null,
    dst_internal: record.DstInternal as boolean ?? null,
    call_answered: record.CallAnswered as boolean ?? null,
    after_hours: isAfterHours(segmentStartTime),
    synced_at: syncedAt,
  }
}

export async function syncCallLogs(): Promise<void> {
  const syncedAt = new Date().toISOString()

  // Client-side date guard (server-side $filter not supported on this 3CX deployment)
  const lookbackCutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  console.log(`  Fetching CallHistoryView ($orderby: SegmentStartTime desc, $top: ${MAX_FETCH})...`)
  console.log(`  Client-side cutoff: ${lookbackCutoff.toISOString()}\n`)

  const raw = await threeCXClient.getCallLogs({
    orderBy: 'SegmentStartTime desc',
    limit: MAX_FETCH,
  })

  // Apply client-side date filter
  const records = raw.filter(
    (r) => new Date(r.SegmentStartTime as string) >= lookbackCutoff
  )

  console.log(`  Raw records fetched: ${raw.length}`)
  console.log(`  Within lookback window: ${records.length}`)

  // Fallback: if window is empty (data predates lookback period), sync all raw records
  const toSync = records.length > 0 ? records : raw
  if (records.length === 0 && raw.length > 0) {
    console.log(`  NOTE: No records within lookback window — syncing all ${raw.length} available records.`)
  }

  if (toSync.length === 0) {
    console.log('\nNo records to sync.')
    return
  }

  const mapped = toSync.map((r) => mapRecord(r, syncedAt))

  let totalUpserted = 0
  let totalErrors = 0
  const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1

    const { error } = await supabase
      .from('call_logs')
      .upsert(chunk, { onConflict: 'id' })

    if (error) {
      console.error(`  Batch ${batchNum}/${totalBatches} ERROR:`, error.message)
      totalErrors += chunk.length
    } else {
      totalUpserted += chunk.length
      console.log(`  Batch ${batchNum}/${totalBatches}: upserted ${chunk.length} records`)
    }
  }

  console.log(`\nSync complete.`)
  console.log(`  Upserted: ${totalUpserted}`)
  console.log(`  Errors:   ${totalErrors}`)
}
