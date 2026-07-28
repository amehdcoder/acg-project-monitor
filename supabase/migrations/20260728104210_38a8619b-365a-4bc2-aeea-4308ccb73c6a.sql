-- Composite unique constraint on (idempotency_key, project_id) — idempotency_key stores the Kobo submission UUID.
-- Partial index because non-Kobo rows leave idempotency_key NULL.
DROP INDEX IF EXISTS public.microplan_entries_idempotency_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS microplan_entries_kobo_submission_project_uidx
  ON public.microplan_entries (idempotency_key, project_id)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_microplan_entries_idempotency_key
  ON public.microplan_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Guarantee realtime broadcasts include full old/new rows for sync log UI.
ALTER TABLE public.kobo_sync_events REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kobo_sync_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kobo_sync_events';
  END IF;
END $$;