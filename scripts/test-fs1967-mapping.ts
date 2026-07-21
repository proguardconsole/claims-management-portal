// Test: run FS1967 through the actual syncClaims mapRecord() logic and print
// the resolved values for all 11 new quick-win fields.
require('dotenv').config({ path: '.env.local' })

import { getClaimDeepLink } from '../lib/constants/zoho'

type ZohoRecord = Record<string, unknown>

function nested(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== 'object') return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

function str(val: unknown): string | null {
  return typeof val === 'string' ? val : null
}

function mapRecord(record: ZohoRecord, syncedAt: string) {
  const id = str(record.id) ?? ''
  return {
    id,
    field_service_number: str(record.Field_Service_Number),
    deal_name: str(record.Deal_Name),
    stage: str(record.Stage),
    tank_type: str(record.Tank_Type),
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
    record_type: str(record.Type),
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
    synced_at: syncedAt,
  }
}

async function main() {
  const { zohoClient } = await import('../lib/zoho/client')

  console.log('Fetching FS1967 (id: 6738694000058217001)...')
  const record = await zohoClient.getRecord('Deals', '6738694000058217001')
  if (!record) throw new Error('Record not found')

  const mapped = mapRecord(record as ZohoRecord, new Date().toISOString())

  console.log('\n=== 11 NEW QUICK-WIN FIELDS — MAPPED OUTPUT ===')
  const newFields = [
    'adjuster_name', 'adjuster_id', 'claim_denied_reason', 'emergency',
    'report_url', 'description', 'modified_by_name', 'start_date',
    'expiration_date', 'deductible_paid_date', 'service_fee_paid_date',
  ] as const

  let allNull = true
  for (const field of newFields) {
    const val = mapped[field]
    const display = val === null ? 'NULL' : JSON.stringify(val)
    const flag = val !== null ? ' ✓' : ''
    console.log(`  ${field.padEnd(24)} ${display}${flag}`)
    if (val !== null) allNull = false
  }

  console.log('\n=== DIAGNOSIS ===')
  if (allNull) {
    console.log('ALL 11 fields resolved to null — mapping is wrong or API returned unexpected shape.')
    console.log('Raw Claims_Adjuster value:', record['Claims_Adjuster'])
    console.log('Raw Emergency value:      ', record['Emergency'])
    console.log('Raw Description value:    ', record['Description'])
  } else {
    console.log('Mapping is WORKING. Fields resolve to non-null values.')
    console.log('If Supabase still shows nulls, the sync has not been re-run since the migration was applied.')
    console.log('→ Trigger POST /api/sync to populate the columns.')
  }
}

main().catch(console.error)
