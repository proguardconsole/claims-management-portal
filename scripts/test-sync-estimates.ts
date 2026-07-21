// Isolate syncEstimates to capture the exact error
require('dotenv').config({ path: '.env.local' })

async function main() {
  try {
    const { syncEstimates } = await import('../lib/sync/syncEstimates')
    console.log('Starting syncEstimates...\n')
    const result = await syncEstimates()
    console.log('\nResult:', result)
  } catch (err) {
    console.error('\n=== SYNC ERROR ===')
    console.error('Message:', err instanceof Error ? err.message : String(err))
    if (err instanceof Error && err.stack) {
      console.error('Stack:', err.stack)
    }
    console.error('Full error object:', err)
  }
}

main()
