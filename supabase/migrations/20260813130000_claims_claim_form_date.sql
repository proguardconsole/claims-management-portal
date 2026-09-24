-- Add claim_form_date (Zoho Claim_Form_Date) to claims table.
-- Used as the open-date for UST claims in place of created_time once synced.
-- DEFAULT NULL: safe to add live; existing rows get null and fall back to created_time in buildRow().
ALTER TABLE claims
  ADD COLUMN claim_form_date date;
