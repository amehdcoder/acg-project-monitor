
-- 1. kobo_sync_events table
CREATE TABLE IF NOT EXISTS public.kobo_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  kobo_uuid text,
  entry_id uuid,
  status text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kobo_sync_events TO authenticated;
GRANT ALL ON public.kobo_sync_events TO service_role;

ALTER TABLE public.kobo_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and super admins can view kobo sync events"
  ON public.kobo_sync_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR (
      project_id IS NOT NULL
      AND public.is_project_member(auth.uid(), project_id)
    )
  );

CREATE INDEX IF NOT EXISTS kobo_sync_events_project_created_idx
  ON public.kobo_sync_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kobo_sync_events_created_idx
  ON public.kobo_sync_events (created_at DESC);

-- 2. Enable realtime for microplan_entries and kobo_sync_events
ALTER TABLE public.microplan_entries REPLICA IDENTITY FULL;
ALTER TABLE public.kobo_sync_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_entries;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kobo_sync_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
