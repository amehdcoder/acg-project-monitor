ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS participant_display_fields text[] NOT NULL DEFAULT ARRAY['name']::text[];
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_participant_display_fields_check CHECK (participant_display_fields <@ ARRAY['name','participant_key','designation','lga','state','cohort']::text[] AND cardinality(participant_display_fields) BETWEEN 1 AND 4);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='quiz_external_results') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_external_results;
  END IF;
END $$;