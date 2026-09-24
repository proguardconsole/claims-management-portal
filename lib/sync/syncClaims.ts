import { createClient } from '@supabase/supabase-js'
import { zohoClient } from '../zoho/client'
import { getClaimDeepLink } from '../constants/zoho'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ZOHO_MODULE = 'Deals'
const PAGE_SIZE = 200
const UPSERT_BATCH_SIZE = 100

type StoredClaim = { stage: string | null; field_service_number: string | null }

type ClaimTransitionEvent = {
  id: string
  claim_id: string
  field_service_number: string | null
  stage: string
  entered_at: string
  days_in_stage: null
  modified_by_name: null
  modified_by_id: null
  synced_at: string
}

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
    const dealName = str(record.Deal_Name) ?? ''
    if (dealName.toLowerCase().includes('inspection')) return 'inspection'
    return 'ast_open'
  }

  if (inferredTankType === 'UST') {
    if (stage === 'Complete') return 'ust_closed'
    if (stage === 'Claim Denied') return 'ust_closed'
    // Claim Form Completed + PTR=No → closed (claim did not proceed)
    if (stage === 'Claim Form Completed' && proceedToRemediation !== 'Yes') return 'ust_closed'
    // Pre-tank stages → pending pull (not yet a claim)
    const preTankStages = ['Needs Analysis', 'Service Fee Billed', 'Attendance Deployed']
    if (preTankStages.includes(stage)) return 'ust_pre_tank'
    // PTR=Yes → open claim
    if (proceedToRemediation === 'Yes') return 'ust_open'
    // Fallthrough
    return 'ust_pre_tank'
  }

  // TODO: Septic pipeline
  // When the Zoho "Septic Claims" pipeline is configured, add a third branch here:
  // if (inferredTankType === 'SEPTIC') {
  //   if (stage === 'Complete') return 'septic_closed'
  //   if (stage === 'Claim Denied') return 'septic_denied'
  //   return 'septic_open'
  // }
  // Also add 'septic_open' to OPEN_STATUSES in /api/claims/route.ts when ready.

  // Fallback for any remaining null tank_type records
  return 'unknown'
}

function mapRecord(record: ZohoRecord, syncedAt: string) {
  const id = str(record.id) ?? ''
  const claimStatus = computeClaimStatus(record)
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
    claim_form_date: str(record.Claim_Form_Date),
    last_activity_time: str(record.Last_Activity_Time),
    created_time: str(record.Created_Time),
    modified_time: str(record.Modified_Time),
    total_amount_paid: typeof record.Total_Amount_Paid === 'number' ? record.Total_Amount_Paid : null,
    total_claim_costs: typeof record.Total_Claim_Costs === 'number' ? record.Total_Claim_Costs : null,
    deductible_paid: typeof record.Deductible_Paid === 'boolean' ? record.Deductible_Paid : null,
    service_fee_paid: typeof record.Service_Fee_Paid === 'boolean' ? record.Service_Fee_Paid : null,
    record_type: claimStatus === 'inspection' ? 'Inspection' : (str(record.Type) ?? 'Claim'),
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
    claim_status: claimStatus,
    synced_at: syncedAt,
  }
}

async function loadStoredStages(): Promise<Map<string, StoredClaim>> {
  // PostgREST caps responses at 1,000 rows; the claims table is past that.
  // Page with .range() until a short page — a partial map here makes the
  // transition detector fire phantom events for every missing claim.
  const PAGE = 1000
  const map = new Map<string, StoredClaim>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from('claims')
      .select('id, stage, field_service_number')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load stored claim stages: ${error.message}`)
    for (const c of data ?? []) {
      map.set(c.id as string, {
        stage: c.stage as string | null,
        field_service_number: c.field_service_number as string | null,
      })
    }
    if ((data ?? []).length < PAGE) break
  }
  return map
}

export async function syncClaims(): Promise<void> {
  const syncedAt = new Date().toISOString()

  // Load stored stages before fetching Zoho — needed to detect transitions
  console.log('  Loading stored claim stages from Supabase...')
  const storedStages = await loadStoredStages()
  console.log(`  ${storedStages.size} existing claims in DB`)

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

  // Detect stage transitions by comparing incoming stage to what's stored in DB.
  // A synthetic deterministic ID ({claim_id}_{stage}) makes this upsert idempotent:
  // if a claim re-enters the same stage, entered_at is refreshed rather than duplicated.
  const transitionEvents: ClaimTransitionEvent[] = []
  for (const m of mapped) {
    const incomingStage = m.stage
    if (!incomingStage) continue
    const stored = storedStages.get(m.id)
    const storedStage = stored?.stage || null
    if (incomingStage !== storedStage) {
      transitionEvents.push({
        id: `${m.id}_${incomingStage}`,
        claim_id: m.id,
        field_service_number: m.field_service_number ?? stored?.field_service_number ?? null,
        stage: incomingStage,
        entered_at: syncedAt,
        days_in_stage: null,
        modified_by_name: null,
        modified_by_id: null,
        synced_at: syncedAt,
      })
    }
  }

  // Upsert claims in batches of 100
  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
    const chunk = mapped.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(mapped.length / UPSERT_BATCH_SIZE)

    const { error } = await getSupabase()
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

  console.log(`\nClaims sync complete.`)
  console.log(`  Upserted: ${totalUpserted}`)
  console.log(`  Errors:   ${totalErrors}`)

  // Write transition events — runs after claims upsert so the stage change is committed first
  if (transitionEvents.length === 0) {
    console.log(`  No stage transitions detected.`)
    return
  }

  console.log(`\n  Writing ${transitionEvents.length} stage transition event(s)...`)
  let eventsWritten = 0
  let eventsErrored = 0

  for (let i = 0; i < transitionEvents.length; i += UPSERT_BATCH_SIZE) {
    const chunk = transitionEvents.slice(i, i + UPSERT_BATCH_SIZE)
    const { error } = await getSupabase()
      .from('claim_events')
      .upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`  claim_events batch error:`, error.message)
      eventsErrored += chunk.length
    } else {
      eventsWritten += chunk.length
    }
  }

  console.log(`  Transition events written: ${eventsWritten}  Errors: ${eventsErrored}`)
  for (const e of transitionEvents) {
    console.log(`    ${e.field_service_number ?? e.claim_id}: → ${e.stage}`)
  }
}
