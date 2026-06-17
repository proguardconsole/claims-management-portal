-- Estimates and Claim Payments tables.
-- Estimates: one per Field Service record, summary cost breakdown.
-- Claim Payments: disbursement records linked to claims (Claim Payout type only).
-- Added 17 Jun 2026.

CREATE TABLE IF NOT EXISTS estimates (
  id                        text PRIMARY KEY,
  claim_id                  text REFERENCES claims(id),
  claim_fsn                 text,
  estimate_total            numeric,
  contractor_costs          numeric,
  state_fees                numeric,
  adjuster_fees             numeric,
  adjuster_fee_status       text,
  adjuster_fees_status      text,
  remediation_form_received boolean,
  state                     text,
  contractor_name           text,
  contractor_id             text,
  created_time              timestamptz,
  modified_time             timestamptz,
  synced_at                 timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_payments (
  id                    text PRIMARY KEY,
  claim_id              text REFERENCES claims(id),
  field_service_number  text,
  payment_number        text,
  payment_date          date,
  payment_method        text,
  amount                numeric,
  status                text,
  incoming_or_outgoing  text,
  stripe_transaction_id text,
  reference_number      text,
  policy_id             text,
  note                  text,
  synced_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimates_claim_id_idx      ON estimates(claim_id);
CREATE INDEX IF NOT EXISTS claim_payments_claim_id_idx ON claim_payments(claim_id);
CREATE INDEX IF NOT EXISTS claim_payments_fsn_idx      ON claim_payments(field_service_number);
