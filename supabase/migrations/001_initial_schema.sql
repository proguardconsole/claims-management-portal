-- Core claims table (sourced from Zoho Deals module)
create table claims (
  id text primary key, -- Zoho record id
  field_service_number text, -- e.g. FS1953
  deal_name text,
  stage text not null,
  tank_type text, -- 'UST' or 'AST'
  claim_trigger text,
  claim_state text,
  proceed_to_remediation text, -- 'Yes' / 'No' / null
  owner_name text,
  owner_email text,
  contact_name text,
  contact_id text,
  account_name text,
  account_id text,
  policy_name text,
  policy_id text,
  contractor_name text,
  street text,
  city text,
  zip text,
  claim_contact_phone text,
  claim_contact_email text,
  date_claim_is_reported date,
  last_activity_time timestamptz,
  created_time timestamptz,
  modified_time timestamptz,
  total_amount_paid numeric,
  total_claim_costs numeric,
  deductible_paid boolean,
  service_fee_paid boolean,
  zoho_deep_link text, -- pre-computed deep link
  synced_at timestamptz default now()
);

-- Computed claim status (derived field, updated by sync job)
alter table claims add column claim_status text;
-- values: 'ast_open' | 'ast_completed' | 'ast_denied' | 'ust_pre_tank' | 'ust_open' | 'ust_closed'

-- Policies (sourced from Zoho Policies module)
create table policies (
  id text primary key,
  name text,
  synced_at timestamptz default now()
);

-- Call logs (sourced from 3CX)
create table call_logs (
  id text primary key,
  call_time timestamptz,
  -- Parsed from 3CX ISO 8601 duration string e.g. PT34.765S → 34
  duration_seconds integer,
  direction text, -- 'inbound' | 'outbound'
  src_number text,        -- SrcCallerNumber from 3CX
  dst_number text,        -- DstCallerNumber from 3CX
  src_internal boolean,   -- SrcInternal flag
  dst_internal boolean,   -- DstInternal flag
  call_answered boolean,  -- CallAnswered from 3CX
  segment_id bigint,      -- 3CX SegmentId (use as primary key instead of generated id)
  phone_number text,
  agent_name text,
  after_hours boolean,
  account_id text, -- matched from Zoho Account via phone lookup
  claim_id text references claims(id),
  synced_at timestamptz default now()
);

-- Indexes for dashboard query performance
create index idx_claims_stage on claims(stage);
create index idx_claims_tank_type on claims(tank_type);
create index idx_claims_claim_status on claims(claim_status);
create index idx_claims_last_activity on claims(last_activity_time);
create index idx_call_logs_claim_id on call_logs(claim_id);
create index idx_call_logs_phone on call_logs(phone_number);
