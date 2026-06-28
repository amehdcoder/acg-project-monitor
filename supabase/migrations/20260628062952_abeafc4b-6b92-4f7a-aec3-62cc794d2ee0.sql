DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'acsm_reports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.acsm_reports';
  END IF;
END $$;
ALTER TABLE public.acsm_reports REPLICA IDENTITY FULL;