require('dotenv').config({ path: '.env.local' })

async function main() {
  const { syncCallLogs } = await import('../lib/sync/syncCallLogs')

  const start = new Date()
  console.log(`[${start.toISOString()}] Starting call logs sync...\n`)

  await syncCallLogs()

  const end = new Date()
  const elapsed = ((end.getTime() - start.getTime()) / 1000).toFixed(1)
  console.log(`\n[${end.toISOString()}] Done. Elapsed: ${elapsed}s`)
}

main().catch(console.error)
