# Handover Inventory — claims-management-portal

Generated 24 September 2026. Phase 1 (inventory only — nothing deleted or modified).

> **Headline finding:** the last git commit is `061fb9b` dated **12 Aug 2026**. Everything
> shipped since — NextAuth + Azure AD auth, the Tasks/Calendar feature, RLS enablement,
> `timingSafeEqual` auth hardening, the 1,000-row pagination fixes, the admin-leak /
> collection-rate fixes — exists **only as 42 uncommitted working-tree changes** on this
> machine. Production (Vercel `proguard-claims`) was deployed from this working tree, so
> prod is ahead of the repo. Committing this work should be the first Phase 2 action.

---

## 1. Top-level tree (2 levels, excl. node_modules / .next / .git)

```
.
├── .claude/launch.json
├── .env.local              (gitignored, present)
├── .env.local.example
├── .eslintrc.json
├── .vercel/                (project.json → proguard-claims, README.txt)
├── README.md
├── app/
│   ├── analytics/  api/  auth/  calls/  claims/  closed/  digest/
│   ├── inspections/  report/  tasks/  fonts/
│   ├── favicon.ico  globals.css  layout.tsx  page.module.css  page.tsx
├── components/
│   ├── AuthSessionProvider.tsx  AutoRefresh.tsx  FilterBar.tsx
│   ├── NavBar.tsx  Sidebar.tsx  TaskModal.tsx
├── lib/
│   ├── 3cx/  constants/  supabase/  sync/  zoho/
│   ├── auth.ts  secureCompare.ts  supabase.ts  users.ts
├── middleware.ts
├── next-env.d.ts  next.config.mjs  postcss.config.js  tailwind.config.ts
├── package.json  package-lock.json  tsconfig.json  tsconfig.tsbuildinfo
├── scripts/                (9 .ts scripts + tsconfig.json + tsconfig.tsbuildinfo)
├── supabase/
│   ├── migrations/         (11 .sql files)
│   └── .temp/              (CLI metadata)
└── vercel.json             (daily cron → /api/sync)
```

No `public/` directory exists.

## 2. Files outside app/ · components/ · lib/ (non-standard-config), grouped

| Group | Files |
|---|---|
| **Docs** | `README.md` |
| **Scripts** | `scripts/backfill-claim-events.ts` (one-off claim_events backfill — has unbounded selects, must not be re-run without pagination), `scripts/run-sync-payments.ts`, `scripts/test-3cx.ts`, `scripts/test-fs1967-mapping.ts`, `scripts/test-quick-win-fields.ts`, `scripts/test-sync-calls.ts`, `scripts/test-sync-estimates.ts`, `scripts/test-sync.ts`, `scripts/test-zoho.ts` |
| **SQL / migrations** | `supabase/migrations/*.sql` (11 files — see §7) |
| **Exports / data dumps** | none in repo |
| **Scratch / debug** | `.DS_Store` (root and `lib/`), `tsconfig.tsbuildinfo` (root and `scripts/`) — build/OS artifacts, all gitignored-eligible |
| **Unknown / notable** | `supabase/.temp/` (Supabase CLI link metadata incl. `pooler-url`, `project-ref` — machine-local, should stay untracked); `.claude/launch.json` (currently holds a local-dev variant with a **dev-only** NEXTAUTH_SECRET literal — value is a testing throwaway, not a real credential, but it's a tracked file with an uncommitted modification; restore or commit deliberately) |

## 3. Leftover debug artifacts

**None on disk.** No route under `app/api/` matches `debug|test|tmp|verify|whoami|check`.

Git history confirms four temporary debug routes existed and were all removed by their
paired "temp: remove …" commits:

| Historical route | Purpose | Removed in |
|---|---|---|
| `app/api/internal/_debug-supabase-project` → renamed `debug-supabase-project` | verify which Supabase project a deployment pointed at (the Sprint 7 one) | `358d373` |
| `app/api/internal/debug-septic-agents` | confirm Septic GTM agent name spellings | `7dbc76f` |
| `app/api/internal/debug-reassign-migrate` | verify/apply reassignment_needed flag | `061fb9b` |

## 4. Dead code

- **`lib/constants/claimDefinitions.ts`** — confirmed **zero imports** anywhere. Documentation only, as intended.
- **`lib/supabase.ts`** — browser-side Supabase client factory (anon key). Confirmed zero imports (audited twice, Aug 20 and today). Deletion was approved in the Aug 20 RLS session but the file is still present — the session was interrupted before the `rm` landed. Candidate for Phase 2 deletion. Note: RLS deny-all makes the anon key useless against the DB, so it is inert but misleading.

## 5. Secrets scan

Patterns searched: `eyJ` (JWT), `sk-` (API key), `1000.` (Zoho token), `process.env.X || "literal"` fallbacks. Scope: all `.ts/.tsx/.js/.json` excluding `node_modules`, `.next`, `package-lock.json`.

| Pattern | Hits | Verdict |
|---|---|---|
| `eyJ` | 0 | clean |
| `sk-` | `lib/users.ts:2` | **false positive** — the substring "ta**sk-a**ssignee" in a comment |
| `1000.` | 0 | clean |
| `process.env.X \|\| "literal"` | 0 | clean — no policy violations |

One non-code note: `.claude/launch.json` contains the literal dev-only NEXTAUTH_SECRET used for local session testing (see §2). Not a production credential.

## 6. Environment variables

| Variable | Used by | Required? |
|---|---|---|
| `CRON_SECRET` | secureCompare + all 20 internal proxies + export/narrative | **required** |
| `NEXT_PUBLIC_SUPABASE_URL` | supabase clients, all sync modules, scripts | **required** |
| `SUPABASE_SERVICE_ROLE_KEY` | server supabase client, sync modules, scripts | **required** |
| `NEXTAUTH_SECRET` | middleware (session gate) | **required** |
| `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` / `AZURE_AD_TENANT_ID` | lib/auth.ts | **required** |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | lib/zoho/client.ts | **required** (sync) |
| `SEPTIC_GTM_SERVICE_KEY` | calls route, claims/[id] route | **required** (call log views) |
| `THREECX_API_BASE_URL` / `THREECX_API_KEY` / `THREECX_CLIENT_ID` | lib/3cx/client.ts, test script | required for call-log sync |
| `ANTHROPIC_API_KEY` | digest/narrative route | optional (route degrades gracefully) |
| `NEXT_PUBLIC_APP_URL` | digest/narrative route | optional (falls back to request host) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **only dead `lib/supabase.ts`** | not needed once dead file removed |

**Gap vs `.env.local.example`:** the example file predates auth and newer integrations. Missing from it: `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, all three `AZURE_AD_*`, `SEPTIC_GTM_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`. It also lists `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` and `ZOHO_ORG_ID`, which no code references (Twilio was never built; ZOHO_ORG_ID is hardcoded in `lib/constants/zoho.ts` deep links). Refresh recommended in Phase 2.

## 7. Migrations (11 files)

| File | What |
|---|---|
| `001_initial_schema.sql` | base schema |
| `20260617171326_claims_quick_win_fields.sql` | claims fields |
| `20260617180630_estimates_and_payments.sql` | estimates + claim_payments |
| `20260618120000_claim_events.sql` | claim_events |
| `20260702120000_inspections_table.sql` | inspections |
| `20260714120000_inspections_add_fsn.sql` | inspections FSN |
| `20260721120000_stale_notes.sql` | stale_notes |
| `20260812120000_claims_reassignment_needed.sql` | reassignment flag |
| `20260813130000_claims_claim_form_date.sql` | claim_form_date |
| `20260817120000_tasks_table.sql` | tasks |
| `20260820120000_enable_rls_deny_all.sql` | RLS on all 12 tables |

**Caveat (as flagged):** early migrations were applied by hand in the SQL editor. On 17 Aug the remote migration history was repaired (`supabase migration repair`) to mark `001`, `20260812`, `20260813` as applied; everything since has gone through `supabase db push`, so repo ↔ remote history now match — but hand-applied drift *predating* the repair (e.g. columns like `report_exclusions`, `report_manual_denials`, `pending_pull_snapshots` tables, which have **no migration file** here yet exist in prod) means the repo is **not** a complete schema record. A `supabase db pull` schema snapshot would close that gap.

## 8. API routes (40 route files)

**Public data routes** (CRON_SECRET-gated, session-gated by middleware) and their BFF proxies — every one has a matching `/api/internal/**` proxy:

analytics · calls · claims · claims/[id] · closed · contractors · digest · digest/narrative · inspections · kpis · report · report/export · report-exclusions (+[fsn]) · report-manual-denials (+[id]) · stale-claims · tasks (+[id]) — **all matched, no gaps**.

**Intentionally proxy-less:** `api/sync` (Vercel Cron / M2M, own auth, public-prefixed in middleware) · `api/auth/[...nextauth]` (NextAuth).

## 9. Git state

- **Branch:** `main`. **Remote:** `origin → github.com/proguardconsole/claims-management-portal` (fetch+push).
- **Last 15 commits:**
```
061fb9b temp: remove debug-reassign-migrate route              (12 Aug 2026 — HEAD)
ffe92a4 feat: add REASSIGN badge for Shawn Zagryn's open claims
779849f temp: migration file + debug route to verify and apply reassignment_needed flag
854e575 feat: replace Shawn with Nick Alexander as second claims agent
7dbc76f temp: remove debug-septic-agents route
4316a76 temp: debug route to confirm Septic GTM agent name spellings
55c82ce fix: preserve scroll position through exclusion/denial refetch
e4a320d fix: bypass Next.js Data Cache for all Supabase queries
358d373 temp: remove debug route
e4e610e temp: fix debug route name (underscore prefix breaks Next.js routing)
40ff01c temp: debug route to confirm supabase project ref
5e0757d Merge pull request #1 from proguardconsole/debug/exclusion-add-trace
518a8f0 fix: add duplex: 'half' to body-bearing NextRequest construction
92e5689 temp: wrap internal proxy handlers in try/catch to surface real errors
d71875a temp: debug logging for exclusion add (EXCLUSION_DEBUG)
```
- **`.env*` in history:** only `.env.local.example` was ever committed (in `c34890f`). `.env.local` itself has never been committed — clean.
- **Uncommitted work (42 paths):** all of auth (middleware, lib/auth, lib/users, auth pages, NavBar/layout changes), the entire Tasks feature (API + proxies + UI + TaskModal), lib/secureCompare, lib/supabase/fetchAll, the tasks + RLS migrations, and every route touched by the September fix sprints. **Prod runs this code; the repo does not have it.**
