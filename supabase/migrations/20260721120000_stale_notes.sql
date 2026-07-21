-- Stores follow-up notes on stale open claims.
-- Note: claims.id is TEXT (Zoho record IDs), so claim_id is TEXT here,
-- not UUID as originally drafted. The ON DELETE CASCADE keeps notes in
-- sync if a claim is ever removed from the sync table.

CREATE TABLE IF NOT EXISTS public.stale_notes (
  id                   UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id             TEXT  NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  field_service_number TEXT,
  note                 TEXT  NOT NULL,
  noted_by             TEXT  NOT NULL DEFAULT 'Team',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stale_notes_claim_id_idx
  ON public.stale_notes(claim_id);

CREATE INDEX IF NOT EXISTS stale_notes_created_at_idx
  ON public.stale_notes(created_at DESC);
