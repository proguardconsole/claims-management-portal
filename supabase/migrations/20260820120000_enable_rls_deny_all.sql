-- Enable RLS on all public tables with NO policies — deny-all-by-default.
-- All app access goes through server-side API routes using the service role
-- key, which bypasses RLS. This closes direct anon/authenticated-key access
-- to the REST endpoint (anon key ships in the browser bundle via NEXT_PUBLIC_).
ALTER TABLE claims                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_pull_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exclusions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_manual_denials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stale_notes             ENABLE ROW LEVEL SECURITY;
