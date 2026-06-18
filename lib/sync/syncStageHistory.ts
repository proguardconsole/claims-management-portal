import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const UPSERT_BATCH_SIZE = 100
const RATE_LIMIT_DELAY_MS = 150

type ZohoRecord = Record<string, unknown>

export interface StageHistorySyncResult {
  synced: number
  errors: number
  claims_processed: number
  elapsed_ms: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function str(val: unknown): string | null {
  return typeof val === 'string' ? val : null
}

function num(val: unknown): number | null {
  return typeof val === 'number' ? val : null
}

function nested(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== 'object') return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

function mapRecord(
  record: ZohoRecord,
  claimId: string,
  fsn: string | null,
  stageMap: Map<string, string>,
  syncedAt: string,
) {
  const stageId = str(record.Stage)
  // Resolve stage ID to display name; fall back to raw ID if picklist is stale
  const stageName = stageId != null ? (stageMap.get(stageId) ?? stageId) : null

  return {
    id: str(record.id) ?? '',
    claim_id: claimId,
    field_service_number: fsn,
    stage: stageName,
    entered_at: str(record.Last_Modified_Time),
    days_in_stage: num(record.$duration_days),
    modified_by_name: nested(record.modified_by, 'name'),
    modified_by_id: nested(record.modified_by, 'id'),
    synced_at: syncedAt,
  }
}

export async function syncStageHistory(): Promise<StageHistorySyncResult> {
  const start = Date.now()
  const syncedAt = new Date().toISOString()

  // Fetch stage picklist once so we can resolve IDs to display names at map time
  console.log('[syncStageHistory] Loading stage picklist...')
  const stageMap = await zohoClient.getFieldPicklist('Deals', 'Stage')
  console.log(`[syncStageHistory] ${stageMap.size} stage values loaded`)

  // Load all claim IDs and FSNs from Supabase — no page limit, we want all
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('id, field_service_number')

  if (claimsError) {
    throw new Error(`Failed to load claim IDs from Supabase: ${claimsError.message}`)
  }

  console.log(`[syncStageHistory] Processing ${claims.length} claims (${RATE_LIMIT_DELAY_MS}ms delay each)...`)

  const allMapped: ReturnType<typeof mapRecord>[] = []
  let claimsProcessed = 0
  let claimsErrored = 0

  for (const claim of claims) {
    // Rate limit: skip delay before the first call
    if (claimsProcessed > 0) await sleep(RATE_LIMIT_DELAY_MS)

    try {
      const records = await zohoClient.getRelatedRecords('Deals', claim.id, 'Stage_History')
      const mapped = records.map((r) =>
        mapRecord(r, claim.id, claim.field_service_number as string | null, stageMap, syncedAt),
      )
      allMapped.push(...mapped)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `  ERROR claim ${claim.id} (${claim.field_service_number ?? 'no FSN'}): ${msg}`,
      )
      claimsErrored++
    }

    claimsProcessed++

    if (claimsProcessed % 100 === 0) {
      console.log(
        `  Progress: ${claimsProcessed}/${claims.length} claims, ${allMapped.length} events collected`,
      )
    }
  }

  console.log(
    `\n[syncStageHistory] Collected ${allMapped.length} events from ${claimsProcessed} claims (${claimsErrored} claim errors)`,
  )

  // Upsert to Supabase in batches
  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < allMapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = allMapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(allMapped.length / UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('claim_events')
      .upsert(chunk, { onConflict: 'id' })

    if (error) {
      console.error(`  Batch ${batchNum}/${totalBatches} ERROR:`, error.message)
      totalErrors += chunk.length
    } else {
      totalUpserted += chunk.length
      console.log(`  Batch ${batchNum}/${totalBatches}: upserted ${chunk.length} records`)
    }
  }

  const elapsed_ms = Date.now() - start
  console.log(
    `\nStage History sync complete. Upserted: ${totalUpserted}  Errors: ${totalErrors}  Claims: ${claimsProcessed}  Elapsed: ${elapsed_ms}ms`,
  )

  return { synced: totalUpserted, errors: totalErrors, claims_processed: claimsProcessed, elapsed_ms }
}
