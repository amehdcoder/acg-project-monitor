ALTER TABLE public.microplan_entries ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.microplan_entries
  DROP CONSTRAINT IF EXISTS unique_idempotency_per_project;

ALTER TABLE public.microplan_entries
  ADD CONSTRAINT unique_idempotency_per_project UNIQUE (idempotency_key, project_id);

CREATE INDEX IF NOT EXISTS idx_microplan_entries_idempotency_key
  ON public.microplan_entries (idempotency_key);