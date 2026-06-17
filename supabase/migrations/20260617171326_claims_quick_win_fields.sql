-- Quick-win CRM fields: confirmed present in Zoho Deals API but previously unsynced.
-- Added after field audit on 17 Jun 2026.
-- All columns use IF NOT EXISTS — safe to re-run.

-- Adjuster (distinct from deal Owner; most records have a different assigned adjuster)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS adjuster_name text;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS adjuster_id text;

-- Denial reason (pairs with claim_denied boolean already in schema)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_denied_reason text;

-- Emergency flag
ALTER TABLE claims ADD COLUMN IF NOT EXISTS emergency boolean;

-- Creator app deep-link (direct URL to the Zoho Creator initial claim form)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS report_url text;

-- Free-text notes field (actively used by staff)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS description text;

-- Audit trail: who last modified the record (separate from Owner)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS modified_by_name text;

-- Policy date window (pulled from Expiration_Date and Start_Date on the Deal)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS expiration_date date;

-- Payment detail dates (pair with deductible_paid / service_fee_paid booleans)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS deductible_paid_date date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS service_fee_paid_date date;
