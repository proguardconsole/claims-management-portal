require('dotenv').config({ path: '.env.local' })

// Dynamic import keeps the require('dotenv').config() call above guaranteed
// to run before ZohoClient reads process.env in its constructor.
async function main() {
  const { zohoClient } = await import('../lib/zoho/client')

  console.log('Fetching FieldServices records (per_page: 3)...\n')

  const records = await zohoClient.getRecords('Deals', { per_page: '3' })

  console.log('Full raw JSON response:')
  console.log(JSON.stringify(records, null, 2))

  if (records.length > 0) {
    console.log('\nField names (keys of first record):')
    console.log(Object.keys(records[0]))
  } else {
    console.log('\nNo records returned.')
  }
}

main().catch(console.error)
