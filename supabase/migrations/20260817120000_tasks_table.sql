-- Tasks table for the Tasks/Calendar feature.
-- claim_id is TEXT to match claims.id (Zoho record IDs, not UUIDs).
CREATE TABLE tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'in_progress', 'done')),
  assignee_email text NOT NULL,
  due_date       date,
  claim_id       text REFERENCES claims(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_claim_id_idx       ON tasks (claim_id);
CREATE INDEX tasks_assignee_email_idx ON tasks (assignee_email);
