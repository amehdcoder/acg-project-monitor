CREATE INDEX IF NOT EXISTS eye_daily_reports_project_updated_id_idx ON public.eye_daily_reports (project_id, updated_at, id);
CREATE INDEX IF NOT EXISTS eye_daily_patients_project_updated_id_idx ON public.eye_daily_patients (project_id, updated_at, id);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eye_daily_reports','eye_daily_patients','eye_visual_trajectories'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;