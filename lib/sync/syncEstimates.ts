import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ZOHO_MODULE = 'Estimates'
const PAGE_SIZE = 200
const UPSERT_BATCH_SIZE = 100

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

// Extracts "FSxxxx" prefix from "FSxxxx Estimate" Name field
function extractFsn(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const match = name.match(/^(FS\d+)\b/)
  return match ? match[1] : null
}

function mapRecord(record: ZohoRecord, syncedAt: string) {
  return {
    id: str(record.id) ?? '',
    claim_id: nested(record.Claim, 'id'),
    claim_fsn: extractFsn(record.Name),
    estimate_total: num(record.Estimate_Total),
    contractor_costs: num(record.Contractor_Costs),
    state_fees: num(record.State_Fees),
    adjuster_fees: num(record.Adjuster_Fees),
    adjuster_fee_status: str(record.Adjuster_Fee_Status),
    adjuster_fees_status: str(record.Adjuster_Fees_Status),
    remediation_form_received:
      typeof record.Remediation_Form_Received === 'boolean'
        ? record.Remediation_Form_Received
        : null,
    state: str(record.State),
    contractor_name: nested(record.Contractor, 'name'),
    contractor_id: nested(record.Contractor, 'id'),
    created_time: str(record.Created_Time),
    modified_time: str(record.Modified_Time),
    synced_at: syncedAt,
  }
}

export async function syncEstimates(): Promise<SyncResult> {
  const start = Date.now()
  const syncedAt = new Date().toISOString()
  const allRecords: ZohoRecord[] = []

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

  console.log(`\nTotal Estimates fetched from Zoho: ${allRecords.length}`)

  const mapped = allRecords.map((r) => mapRecord(r, syncedAt))

  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('estimates')
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
  console.log(`\nEstimates sync complete. Upserted: ${totalUpserted}  Errors: ${totalErrors}  Elapsed: ${elapsed_ms}ms`)

  return { synced: totalUpserted, errors: totalErrors, elapsed_ms }
}
