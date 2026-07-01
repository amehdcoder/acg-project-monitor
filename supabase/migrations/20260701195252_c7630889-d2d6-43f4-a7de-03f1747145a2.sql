ALTER TABLE public.forms REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.forms;
  END IF;
END $$;