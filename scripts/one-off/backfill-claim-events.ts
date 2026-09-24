// ONE-OFF. Has unbounded selects. Do not re-run without adding pagination.
//
// One-off backfill: claim_events gap Jul 21 – Aug 6 2026
//
// syncStageHistory silently timed out on Vercel; 34 claims reached terminal stages
// with no claim_events row. The new sync-native approach (syncClaims transition
// detection) will cover future transitions; this script patches the gap.
//
// Dry-run (default — prints what would be written, touches nothing):
//   npx tsx scripts/backfill-claim-events.ts
//
// Write mode (commits to DB):
//   npx tsx scripts/backfill-claim-events.ts --write
//
// Accepted limitation: we only know each claim's FINAL stage, not intermediate
// stages it may have passed through during the gap. All backfilled entered_at
// values are approximations derived from claims.modified_time.

require('dotenv').config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const WRITE_MODE = process.argv.includes('--write')

// Last date syncStageHistory successfully ran (approximate)
const GAP_START = '2026-07-21'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Terminal claim_statuses whose closing stage we need to verify is in claim_events
const TERMINAL_STATUSES = ['ust_closed', 'ast_completed', 'ast_denied'] as const

// Stages that count as "closing" — the stages the report filters on
const CLOSING_STAGES = new Set(['Complete', 'Claim Denied', 'Claim Form Completed'])

type ClaimRow = {
  id: string
  field_service_number: string | null
  stage: string | null
  claim_status: string
  modified_time: string | null
}

type EventRow = {
  claim_id: string
  stage: string | null
}

type BackfillEvent = {
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

async function main(): Promise<void> {
  const now = new Date().toISOString()

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  Backfill claim_events — gap since ${GAP_START}`)
  console.log(`  Mode: ${WRITE_MODE ? '⚠️  WRITE (will commit to DB)' : '🔍 DRY RUN (read-only)'}`)
  console.log(`${'─'.repeat(70)}\n`)

  // Load all terminal claims
  const { data: claims, error: claimsErr } = await supabase
    .from('claims')
    .select('id, field_service_number, stage, claim_status, modified_time')
    .in('claim_status', [...TERMINAL_STATUSES])

  if (claimsErr) throw new Error(`Failed to load claims: ${claimsErr.message}`)
  console.log(`Terminal claims loaded: ${claims.length}`)

  // Load existing claim_events for all closing stages (to detect which claims are covered)
  const { data: events, error: eventsErr } = await supabase
    .from('claim_events')
    .select('claim_id, stage')
    .in('stage', [...CLOSING_STAGES])

  if (eventsErr) throw new Error(`Failed to load claim_events: ${eventsErr.message}`)

  // Build set of already-covered (claim_id, stage) pairs
  const covered = new Set<string>(
    (events as EventRow[]).map((e) => `${e.claim_id}|${e.stage}`),
  )
  console.log(`Existing closing-stage events: ${covered.size}`)

  // Find claims missing a closing event for their current stage
  const toBackfill: BackfillEvent[] = []
  const skippedNoClosingStage: ClaimRow[] = []

  for (const c of claims as ClaimRow[]) {
    const stage = c.stage
    if (!stage || !CLOSING_STAGES.has(stage)) {
      // Terminal claim_status but the stage itself isn't one we track — skip but log
      skippedNoClosingStage.push(c)
      continue
    }
    if (covered.has(`${c.id}|${stage}`)) continue

    const enteredAt = c.modified_time ?? now

    toBackfill.push({
      id: `${c.id}_${stage}`,          // same synthetic ID pattern as sync-native events
      claim_id: c.id,
      field_service_number: c.field_service_number,
      stage,
      entered_at: enteredAt,
      days_in_stage: null,
      modified_by_name: null,
      modified_by_id: null,
      synced_at: now,
    })
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log(`\nAlready covered: ${claims.length - toBackfill.length - skippedNoClosingStage.length}`)
  console.log(`Skipped (stage not a closing stage): ${skippedNoClosingStage.length}`)

  if (skippedNoClosingStage.length > 0) {
    for (const c of skippedNoClosingStage) {
      console.log(`  ⚠  ${c.field_service_number ?? c.id}  status=${c.claim_status}  stage=${c.stage ?? 'null'}`)
    }
  }

  console.log(`\nTo backfill: ${toBackfill.length}`)

  if (toBackfill.length === 0) {
    console.log('\nNothing to do — all terminal claims already have closing events.')
    return
  }

  // ── Dry-run output ───────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  Records that would be inserted`)
  console.log(`${'─'.repeat(70)}`)
  console.log(
    `${'FSN'.padEnd(12)}${'status'.padEnd(17)}${'stage'.padEnd(15)}${'entered_at (= modified_time)'}`,
  )
  console.log('─'.repeat(70))

  for (const e of toBackfill) {
    const fsn = (e.field_service_number ?? e.claim_id).padEnd(12)
    const status = (claims as ClaimRow[])
      .find((c) => c.id === e.claim_id)?.claim_status.padEnd(17) ?? ''.padEnd(17)
    const stage = e.stage.padEnd(15)
    const enteredAt = e.entered_at
    console.log(`${fsn}${status}${stage}${enteredAt}`)
  }

  console.log(`\n⚠️  Limitation: entered_at is derived from claims.modified_time, not the`)
  console.log(`   actual stage-entry timestamp. Claims that passed through intermediate`)
  console.log(`   stages during the gap (July 21 – Aug 6) will only have their FINAL`)
  console.log(`   closing stage recorded. Intermediate transitions are not recoverable.`)
  console.log(`\n   Synthetic event IDs use the pattern {claim_id}_{stage}, consistent`)
  console.log(`   with how syncClaims now writes transition events going forward.`)

  if (!WRITE_MODE) {
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`  DRY RUN complete — no changes written.`)
    console.log(`  To commit: npx tsx scripts/backfill-claim-events.ts --write`)
    console.log(`${'─'.repeat(70)}\n`)
    return
  }

  // ── Write mode ───────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  Writing ${toBackfill.length} events to claim_events...`)
  console.log(`${'─'.repeat(70)}`)

  const BATCH = 100
  let written = 0
  let errored = 0

  for (let i = 0; i < toBackfill.length; i += BATCH) {
    const chunk = toBackfill.slice(i, i + BATCH)
    const { error } = await supabase
      .from('claim_events')
      .upsert(chunk, { onConflict: 'id' })

    if (error) {
      console.error(`  Batch error: ${error.message}`)
      errored += chunk.length
    } else {
      written += chunk.length
      console.log(`  Wrote ${chunk.length} events (running total: ${written})`)
    }
  }

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  Done. Written: ${written}  Errors: ${errored}`)
  console.log(`${'─'.repeat(70)}\n`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
