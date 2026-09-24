# Scripts

Ad-hoc scripts run with `npx tsx scripts/<name>.ts` from the repo root.
They read `.env.local` and hit the **live** Supabase/Zoho/3CX unless noted.

| Script | What it does | Safe to re-run? | Touches |
|---|---|---|---|
| `run-sync-payments.ts` | Runs the payments sync (`syncPayments`) once, outside the cron | Yes — same idempotent upsert the daily sync performs | Zoho read, `claim_payments` write |
| `test-sync.ts` | Runs the claims sync (`syncClaims`) once | Yes — idempotent upsert; also writes stage-transition events it detects | Zoho read, `claims` + `claim_events` write |
| `test-sync-calls.ts` | Runs the 3CX call-log sync once | Yes — idempotent upsert | 3CX read, `call_logs` write |
| `test-sync-estimates.ts` | Runs `syncEstimates` in isolation (written to capture a sync error) | Yes — idempotent upsert | Zoho read, `estimates` write |
| `test-zoho.ts` | Connectivity check against the Zoho CRM API | Yes — read-only | Zoho read |
| `test-3cx.ts` | Connectivity check against the 3CX API | Yes — read-only | 3CX read |
| `test-fs1967-mapping.ts` | Runs one claim (FS1967) through `syncClaims`' `mapRecord()` and prints the result | Yes — read/print only | Zoho read |
| `test-quick-win-fields.ts` | One-record check that field mappings resolve and schema columns exist | Yes — read-only | Zoho + Supabase read |
| `one-off/backfill-claim-events.ts` | **ONE-OFF** — patched the Jul–Aug 2026 `claim_events` gap. Dry-run by default; `--write` commits | **No** — has unbounded selects that silently truncate at 1,000 rows; do not re-run without adding pagination | `claims` + `claim_events` read, `claim_events` write (with `--write`) |
