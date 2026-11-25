DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='programme_modules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.programme_modules;
  END IF;
END $$;