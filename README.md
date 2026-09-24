# ProGuard Claims Management Portal

Internal dashboard for ProGuard's AST/UST claims operations: open-claims board,
weekly report (web + Excel export), analytics, inspections, call logs, weekly
digest, and a tasks/calendar board for the claims team. Data is synced daily
from Zoho CRM into Supabase; the UI reads from Supabase only.

**Production:** https://proguard-claims.vercel.app (Vercel project `proguard-claims` — the only deploy target).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Database | Supabase Postgres (project `cxqzacvdcexcxhrssafl`), deny-all RLS; all access server-side via service role |
| Auth | NextAuth v4 + Azure AD (Entra ID), 4-person allowlist in `lib/users.ts` / `lib/auth.ts` |
| Data sources | Zoho CRM (claims, estimates, payments, inspections), 3CX (call logs), Septic GTM Supabase (phone calls) |
| Sync | Daily Vercel Cron → `/api/sync` (10:00 UTC); manual trigger with `CRON_SECRET` bearer |
| API pattern | Public `/api/*` routes (CRON_SECRET-gated) fronted by `/api/internal/*` BFF proxies for the browser |

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in values — see comments in the file
npm run dev
```

Sign-in requires an allowlisted Azure AD account. Every table has deny-all RLS,
so a valid `SUPABASE_SERVICE_ROLE_KEY` is required for any data to load.

Type-check and build:

```bash
npx tsc --noEmit
npm run build
```

## Repository map

- `app/` — pages + API routes (`app/api/internal/*` are the browser-facing proxies)
- `components/` — shared UI (nav, filter bar, task modal)
- `lib/` — auth, Supabase clients (`lib/supabase/`), Zoho/3CX clients, sync modules (`lib/sync/`)
- `supabase/migrations/` — schema migrations, applied with `supabase db push` (do not move this folder)
- `scripts/` — ad-hoc sync/test scripts; see `scripts/README.md`
- `docs/` — handover, architecture, runbooks, decision records

## Documentation

Start with `docs/handover/` (repo inventory and handover manual) and `CLAUDE.md`
at the repo root (operating manual for AI-assisted maintenance) once supplied.
No secrets belong in this repo — environment variable names live in
`.env.local.example`, values only in `.env.local` and Vercel.
