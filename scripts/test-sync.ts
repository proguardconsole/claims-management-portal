require('dotenv').config({ path: '.env.local' })

async function main() {
  const { syncClaims } = await import('../lib/sync/syncClaims')

  const start = new Date()
  console.log(`[${start.toISOString()}] Starting claims sync...\n`)

  await syncClaims()

  const end = new Date()
  const elapsed = ((end.getTime() - start.getTime()) / 1000).toFixed(1)
  console.log(`\n[${end.toISOString()}] Done. Elapsed: ${elapsed}s`)
}

main().catch(console.error)
