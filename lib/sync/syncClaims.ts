import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'
import { getClaimDeepLink } from '../constants/zoho'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ZOHO_MODULE = 'Deals'
const PAGE_SIZE = 200
const UPSERT_BATCH_SIZE = 100

type ZohoRecord = Record<string, unknown>

// Safe accessor for nested Zoho lookup objects e.g. record.Owner?.name
function nested(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== 'object') return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

function str(val: unknown): string | null {
  return typeof val === 'string' ? val : null
}

function cleanStage(val: unknown): string {
  const s = typeof val === 'string' ? val : ''
  // Strip "75:" or "100:" style prefixes Zoho adds
  return s.replace(/^\d+:\s*/, '').trim()
}

function computeClaimStatus(record: ZohoRecord): string {
  const stage = cleanStage(record.Stage)
  const tankType = str(record.Tank_Type)
  const recordType = str(record.Type)
  const proceedToRemediation = str(record.Proceed_to_Remediation)

  // Fallback: infer tank type from Pipeline field name
  // when Zoho doesn't return Tank_Type via API
  const pipeline = str(record.Pipeline) ?? ''
  const inferredTankType = tankType
    ?? (pipeline.toUpperCase().includes('AST') ? 'AST'
      : pipeline.toUpperCase().includes('UST') ? 'UST'
      : null)

  // Only treat as inspection if explicitly typed as Inspection, or if we have
  // no tank type and it's explicitly typed as something other than Claim.
  // Records with null recordType and null tankType fall through to 'unknown'.
  if (recordType === 'Inspection' || (!inferredTankType && recordType !== 'Claim' && recordType !== null)) {
    return 'inspection'
  }

  if (inferredTankType === 'AST') {
    if (stage === 'Complete') return 'ast_completed'
    if (stage === 'Claim Denied') return 'ast_denied'
    return 'ast_open'
  }

  if (inferredTankType === 'UST') {
    if (stage === 'Complete') return 'ust_closed'
    if (stage === 'Claim Denied') return 'ust_closed'
    const preTankStages = ['Needs Analysis', 'Service Fee Billed', 'Attendance Deployed']
    if (preTankStages.includes(stage)) return 'ust_pre_tank'
    if (proceedToRemediation === 'Yes') return 'ust_open'
    return 'ust_pre_tank'
  }

  // Fallback for any remaining null tank_type records
  return 'unknown'
}

function mapRecord(record: ZohoRecord, syncedAt: string) {
  const id = str(record.id) ?? ''
  return {
    id,
    field_service_number: str(record.Field_Service_Number),
    deal_name: str(record.Deal_Name),
    stage: cleanStage(record.Stage),
    tank_type: str(record.Tank_Type)
      ?? (str(record.Pipeline)?.toUpperCase().includes('AST') ? 'AST'
        : str(record.Pipeline)?.toUpperCase().includes('UST') ? 'UST'
        : null),
    claim_trigger: str(record.Claim_Trigger),
    claim_state: str(record.Claim_State),
    proceed_to_remediation: str(record.Proceed_to_Remediation),
    owner_name: nested(record.Owner, 'name'),
    owner_email: nested(record.Owner, 'email'),
    contact_name: nested(record.Contact_Name, 'name'),
    contact_id: nested(record.Contact_Name, 'id'),
    account_name: nested(record.Account_Name, 'name'),
    account_id: nested(record.Account_Name, 'id'),
    policy_name: nested(record.Policy, 'name'),
    policy_id: nested(record.Policy, 'id'),
    contractor_name: nested(record.Contractor, 'name'),
    street: str(record.Street),
    city: str(record.City),
    zip: str(record.Zip),
    claim_contact_phone: str(record.Claim_Contact_Phone),
    claim_contact_email: str(record.Claim_Contact_Email),
    date_claim_is_reported: str(record.Date_Claim_is_Reported),
    last_activity_time: str(record.Last_Activity_Time),
    created_time: str(record.Created_Time),
    modified_time: str(record.Modified_Time),
    total_amount_paid: typeof record.Total_Amount_Paid === 'number' ? record.Total_Amount_Paid : null,
    total_claim_costs: typeof record.Total_Claim_Costs === 'number' ? record.Total_Claim_Costs : null,
    deductible_paid: typeof record.Deductible_Paid === 'boolean' ? record.Deductible_Paid : null,
    service_fee_paid: typeof record.Service_Fee_Paid === 'boolean' ? record.Service_Fee_Paid : null,
    record_type: str(record.Type) ?? 'Claim',
    claim_denied: record.Claim_Denied === true,
    adjuster_name: nested(record.Claims_Adjuster, 'name'),
    adjuster_id: nested(record.Claims_Adjuster, 'id'),
    claim_denied_reason: str(record.Claim_Denied_Reason),
    emergency: typeof record.Emergency === 'boolean' ? record.Emergency : null,
    report_url: str(record.Report_URL),
    description: str(record.Description),
    modified_by_name: nested(record.Modified_By, 'name'),
    start_date: str(record.Start_Date),
    expiration_date: str(record.Expiration_Date),
    deductible_paid_date: str(record.Deductible_Paid_Date),
    service_fee_paid_date: str(record.Service_Fee_Paid_Date),
    zoho_deep_link: getClaimDeepLink(id),
    claim_status: computeClaimStatus(record),
    synced_at: syncedAt,
  }
}

export async function syncClaims(): Promise<void> {
  const syncedAt = new Date().toISOString()
  const allRecords: ZohoRecord[] = []

  // Paginate through all Zoho Deals records
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

  console.log(`\nTotal records fetched from Zoho: ${allRecords.length}`)

  // Map all records to Supabase shape
  const mapped = allRecords.map((r) => mapRecord(r, syncedAt))

  // Upsert in batches of 100
  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('claims')
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
