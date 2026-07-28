
ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS kobo_submission_id TEXT;

UPDATE public.microplan_entries
   SET idempotency_key = kobo_submission_id
 WHERE idempotency_key IS NULL AND kobo_submission_id IS NOT NULL;

-- Drop any older partial/legacy unique indexes so ON CONFLICT can bind cleanly.
DROP INDEX IF EXISTS public.microplan_entries_kobo_submission_project_uidx;
ALTER TABLE public.microplan_entries
  DROP CONSTRAINT IF EXISTS unique_kobo_submission_per_project,
  DROP CONSTRAINT IF EXISTS unique_idempotency_per_project;

-- Full (non-partial) composite unique constraint — required for ON CONFLICT.
ALTER TABLE public.microplan_entries
  ADD CONSTRAINT unique_idempotency_per_project
  UNIQUE (idempotency_key, project_id);

CREATE INDEX IF NOT EXISTS idx_microplan_entries_idempotency
  ON public.microplan_entries (idempotency_key, project_id)
  WHERE idempotency_key IS NOT NULL;
