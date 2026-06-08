# claims-management-portal

Internal portal for managing insurance claims workflows. Built with Next.js 14 (App Router), TypeScript, and Supabase.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database / Auth | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) |
| Telephony | 3CX (REST API) + Twilio |
| CRM | Zoho |

## Environment setup

1. Copy the example env file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in each variable:

   | Variable | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
   | `ZOHO_CLIENT_ID` | Zoho API Console → your OAuth app |
   | `ZOHO_CLIENT_SECRET` | Zoho API Console → your OAuth app |
   | `ZOHO_REFRESH_TOKEN` | Generate via Zoho OAuth flow (offline_access scope) |
   | `ZOHO_ORG_ID` | Zoho Desk → Settings → Developer Space → Org ID |
   | `THREECX_API_BASE_URL` | Your 3CX admin panel → API settings |
   | `THREECX_API_KEY` | Your 3CX admin panel → API settings |
   | `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
   | `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |

3. Run the dev server:
   ```bash
   npm run dev
   ```

## Supabase client

Two exports from `lib/supabase.ts`:

| Export | Use in |
|---|---|
| `createClient()` | Client Components |
| `createServerSupabaseClient()` | Server Components, Route Handlers, Server Actions |
