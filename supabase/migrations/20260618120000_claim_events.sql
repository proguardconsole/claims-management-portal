CREATE TABLE IF NOT EXISTS claim_events (
  id                text PRIMARY KEY,
  claim_id          text REFERENCES claims(id),
  field_service_number text,
  stage             text,
  entered_at        timestamptz,
  days_in_stage     numeric,
  modified_by_name  text,
  modified_by_id    text,
  synced_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_events_claim_id_idx  ON claim_events(claim_id);
CREATE INDEX IF NOT EXISTS claim_events_entered_at_idx ON claim_events(entered_at);
