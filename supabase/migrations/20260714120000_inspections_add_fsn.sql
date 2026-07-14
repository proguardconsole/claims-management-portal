-- Fully idempotent: safe to run whether the table exists or not.

CREATE TABLE IF NOT EXISTS inspections (
  id                      text PRIMARY KEY,
  name                    text,
  stage                   text,
  closing_date            date,
  mobile_home_park_name   text,
  mobile_home_park_id     text,
  park_inspection_name    text,
  park_inspection_id      text,
  location_id             text,
  system_id               text,
  provider_contact        text,
  provider_login          text,
  phone                   text,
  street                  text,
  state                   text,
  zip                     text,
  owner_name              text,
  owner_id                text,
  contact_name            text,
  contact_id              text,
  created_time            timestamptz,
  modified_time           timestamptz,
  synced_at               timestamptz DEFAULT now(),
  field_service_number    text
);

-- Safe to run if table already existed without the FSN column
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS field_service_number text;

CREATE INDEX IF NOT EXISTS inspections_stage_idx
  ON inspections(stage);
CREATE INDEX IF NOT EXISTS inspections_park_idx
  ON inspections(mobile_home_park_id);
CREATE INDEX IF NOT EXISTS inspections_closing_date_idx
  ON inspections(closing_date);
CREATE INDEX IF NOT EXISTS inspections_park_inspection_idx
  ON inspections(park_inspection_id);
CREATE INDEX IF NOT EXISTS inspections_fsn_idx
  ON inspections(field_service_number);
