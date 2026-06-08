require('dotenv').config({ path: '.env.local' })

async function main() {
  const { threeCXClient } = await import('../lib/3cx/client')

  console.log('THREECX_API_BASE_URL:', process.env.THREECX_API_BASE_URL)
  console.log('Fetching 3CX call logs (limit: 5)...\n')

  const records = await threeCXClient.getCallLogs({ limit: 5 })

  console.log('Full raw response:')
  console.log(JSON.stringify(records, null, 2))

  if (records.length > 0) {
    console.log('\nField names (keys of first record):')
    console.log(Object.keys(records[0]))
  } else {
    console.log('\nNo records returned.')
  }
}

main().catch(console.error)
