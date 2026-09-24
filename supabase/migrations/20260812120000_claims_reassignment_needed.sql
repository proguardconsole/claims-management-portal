-- Add reassignment_needed flag to claims
-- Used to surface Shawn Zagryn's open claims for transfer to another agent.
-- DEFAULT false: safe to add live — all existing rows get false automatically.
ALTER TABLE claims
  ADD COLUMN reassignment_needed boolean NOT NULL DEFAULT false;
