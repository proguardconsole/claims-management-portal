// One-record test: confirm new quick-win field mappings resolve and schema columns exist.
require('dotenv').config({ path: '.env.local' })

type ZohoRecord = Record<string, unknown>

function nested(obj: unknown, key: string): string | null {
  if (obj == null || typeof obj !== 'object') return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

function str(val: unknown): string | null {
  return typeof val === 'string' ? val : null
}

async function main() {
  const { zohoClient } = await import('../lib/zoho/client')
  const { createClient } = await import('@supabase/supabase-js')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch exactly 1 record from Zoho
  const records = await zohoClient.getRecords('Deals', { per_page: '1', page: '1' })
  const raw: ZohoRecord = records[0]

  console.log('\n=== RAW API VALUES (new fields) ===')
  console.log('Claims_Adjuster:      ', raw.Claims_Adjuster)
  console.log('Claim_Denied_Reason:  ', raw.Claim_Denied_Reason)
  console.log('Emergency:            ', raw.Emergency)
  console.log('Report_URL:           ',
    typeof raw.Report_URL === 'string' ? raw.Report_URL.slice(0, 80) + '...' : raw.Report_URL)
  console.log('Description:          ', raw.Description)
  console.log('Modified_By:          ', raw.Modified_By)
  console.log('Start_Date:           ', raw.Start_Date)
  console.log('Expiration_Date:      ', raw.Expiration_Date)
  console.log('Deductible_Paid_Date: ', raw.Deductible_Paid_Date)
  console.log('Service_Fee_Paid_Date:', raw.Service_Fee_Paid_Date)

  console.log('\n=== MAPPED VALUES ===')
  console.log('adjuster_name:        ', nested(raw.Claims_Adjuster, 'name'))
  console.log('adjuster_id:          ', nested(raw.Claims_Adjuster, 'id'))
  console.log('claim_denied_reason:  ', str(raw.Claim_Denied_Reason))
  console.log('emergency:            ', typeof raw.Emergency === 'boolean' ? raw.Emergency : null)
  console.log('report_url:           ',
    typeof raw.Report_URL === 'string' ? raw.Report_URL.slice(0, 80) + '...' : null)
  console.log('description:          ', str(raw.Description))
  console.log('modified_by_name:     ', nested(raw.Modified_By, 'name'))
  console.log('start_date:           ', str(raw.Start_Date))
  console.log('expiration_date:      ', str(raw.Expiration_Date))
  console.log('deductible_paid_date: ', str(raw.Deductible_Paid_Date))
  console.log('service_fee_paid_date:', str(raw.Service_Fee_Paid_Date))

  // Schema check — SELECT the new columns to confirm migration has been applied
  console.log('\n=== SCHEMA CHECK ===')
  const { data, error } = await supabase
    .from('claims')
    .select(`
      id,
      adjuster_name,
      adjuster_id,
      claim_denied_reason,
      emergency,
      report_url,
      description,
      modified_by_name,
      start_date,
      expiration_date,
      deductible_paid_date,
      service_fee_paid_date
    `)
    .limit(1)

  if (error) {
    console.log('SCHEMA ERROR:', error.message)
    console.log('→ Run the migration in Supabase SQL Editor before triggering a live sync.')
  } else {
    console.log('All new columns present in schema.')
    console.log('Sample row from claims table:', JSON.stringify(data?.[0], null, 2))
  }
}

main().catch(console.error)
