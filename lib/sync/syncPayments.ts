import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ZOHO_MODULE = 'Payments'
const PAGE_SIZE = 200
const UPSERT_BATCH_SIZE = 100
const CLAIM_PAYOUT_TYPE = 'Claim Payout'

type ZohoRecord = Record<string, unknown>

export interface SyncResult {
  synced: number
  errors: number
  elapsed_ms: number
}

function nested(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== 'object') return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

function str(val: unknown): string | null {
  return typeof val === 'string' ? val : null
}

function num(val: unknown): number | null {
  return typeof val === 'number' ? val : null
}

function mapRecord(record: ZohoRecord, syncedAt: string) {
  return {
    id: str(record.id) ?? '',
    claim_id: nested(record.Claim, 'id'),
    field_service_number: str(record.Field_Service_Number),
    payment_number: str(record.Payment_Number),
    payment_date: str(record.Payment_Date),
    payment_method: str(record.Payment_Method),
    amount: num(record.Amount),
    status: str(record.Status),
    incoming_or_outgoing: str(record.Incoming_or_Outgoing),
    stripe_transaction_id: str(record.Stripe_Transaction_ID),
    reference_number: str(record.Reference_Number),
    policy_id: nested(record.Policy, 'id'),
    note: str(record.Note),
    synced_at: syncedAt,
  }
}

export async function syncPayments(): Promise<SyncResult> {
  const start = Date.now()
  const syncedAt = new Date().toISOString()
  const allRecords: ZohoRecord[] = []

  // Fetch all — Zoho API $filter support is unconfirmed on this org.
  // Client-side filter to Claim Payout type after fetch.
  let page = 1
  while (true) {
    console.log(`  Fetching page ${page} from Zoho (per_page: ${PAGE_SIZE})...`)
    const batch = await zohoClient.getRecords(ZOHO_MODULE, {
      per_page: String(PAGE_SIZE),
      page: String(page),
    })

    allRecords.push(...batch)
    console.log(`  Page ${page}: ${batch.length} records (running total: ${allRecords.length})`)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  const claimPayouts = allRecords.filter((r) => r.Payment_Type === CLAIM_PAYOUT_TYPE)

  console.log(`\nTotal Payments fetched from Zoho: ${allRecords.length}`)
  console.log(`  Claim Payout records: ${claimPayouts.length}`)
  console.log(`  Skipped (non-claim):  ${allRecords.length - claimPayouts.length}`)

  const mapped = claimPayouts.map((r) => mapRecord(r, syncedAt))

  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('claim_payments')
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
  console.log(`\nPayments sync complete. Upserted: ${totalUpserted}  Errors: ${totalErrors}  Elapsed: ${elapsed_ms}ms`)

  return { synced: totalUpserted, errors: totalErrors, elapsed_ms }
}
