import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ZOHO_MODULE = 'Inspections'
const PAGE_SIZE = 200
const UPSERT_BATCH_SIZE = 100

type ZohoRecord = Record<string, unknown>

export interface InspectionSyncResult {
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

function mapRecord(record: ZohoRecord, syncedAt: string) {
  return {
    id: str(record.id) ?? '',
    name: str(record.Name),
    stage: str(record.Stage),
    closing_date: str(record.Closing_Date) ?? null,
    mobile_home_park_name: nested(record.Mobile_Home_Park, 'name'),
    mobile_home_park_id: nested(record.Mobile_Home_Park, 'id'),
    park_inspection_name: nested(record.Park_Inspection, 'name'),
    park_inspection_id: nested(record.Park_Inspection, 'id'),
    location_id: nested(record.Location, 'id'),
    system_id: nested(record.System, 'id'),
    provider_contact: str(record.Provider_Contact),
    provider_login: str(record.Provider_Login),
    phone: str(record.Phone),
    street: str(record.Street),
    state: str(record.State1),
    zip: str(record.Zip),
    owner_name: nested(record.Owner, 'name'),
    owner_id: nested(record.Owner, 'id'),
    contact_name: nested(record.Contact_Name, 'name'),
    contact_id: nested(record.Contact_Name, 'id'),
    field_service_number: str(record.Field_Service_Number),
    inspection_result: str(record.Inspection_Result),
    inspection_date: str(record.Inspection_Date) ?? null,
    created_time: str(record.Created_Time),
    modified_time: str(record.Modified_Time),
    synced_at: syncedAt,
  }
}

export async function syncInspections(): Promise<InspectionSyncResult> {
  const start = Date.now()
  const syncedAt = new Date().toISOString()
  const allRecords: ZohoRecord[] = []

  let page = 1
  while (true) {
    console.log(`  Fetching page ${page} from Zoho Inspections (per_page: ${PAGE_SIZE})...`)
    const batch = await zohoClient.getRecords(ZOHO_MODULE, {
      per_page: String(PAGE_SIZE),
      page: String(page),
    })

    allRecords.push(...batch)
    console.log(`  Page ${page}: ${batch.length} records (running total: ${allRecords.length})`)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  console.log(`\nTotal Inspections fetched from Zoho: ${allRecords.length}`)

  const mapped = allRecords.map((r) => mapRecord(r, syncedAt))

  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('inspections')
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
    `\nInspections sync complete. Upserted: ${totalUpserted}  Errors: ${totalErrors}  Elapsed: ${elapsed_ms}ms`,
  )

  return { synced: totalUpserted, errors: totalErrors, elapsed_ms }
}
