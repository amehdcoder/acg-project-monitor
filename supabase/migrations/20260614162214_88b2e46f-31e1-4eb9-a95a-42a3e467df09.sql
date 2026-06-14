GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_calls TO authenticated;
GRANT ALL ON public.active_calls TO service_role;

ALTER TABLE public.active_calls REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'active_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;
  END IF;
END $$;