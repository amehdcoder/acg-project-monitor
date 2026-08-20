CREATE TABLE public.quiz_kobo_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL UNIQUE REFERENCES public.quizzes(id) ON DELETE CASCADE,
  server_url text NOT NULL DEFAULT 'https://kf.kobotoolbox.org',
  form_uid text NOT NULL,
  form_title text,
  api_token text NOT NULL,
  sync_mode text NOT NULL DEFAULT 'webhook',
  webhook_secret text NOT NULL DEFAULT ('qks_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  question_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  identity_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_kobo_configs TO authenticated;
GRANT ALL ON public.quiz_kobo_configs TO service_role;
ALTER TABLE public.quiz_kobo_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_kobo_configs_admin_all" ON public.quiz_kobo_configs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));

CREATE TABLE public.quiz_kobo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.quiz_kobo_configs(id) ON DELETE SET NULL,
  kobo_submission_id text NOT NULL,
  kobo_uuid text,
  participant_name text NOT NULL DEFAULT 'Unknown',
  participant_key text NOT NULL DEFAULT 'unknown',
  assessment_type text NOT NULL DEFAULT 'pre',
  intervention_group text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  per_question jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  band text NOT NULL DEFAULT 'needs_training',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, kobo_submission_id)
);

CREATE INDEX idx_quiz_kobo_submissions_quiz ON public.quiz_kobo_submissions (quiz_id, submitted_at DESC);
CREATE INDEX idx_quiz_kobo_submissions_participant ON public.quiz_kobo_submissions (quiz_id, participant_key, assessment_type);
CREATE INDEX idx_quiz_kobo_submissions_group ON public.quiz_kobo_submissions (quiz_id, intervention_group);

GRANT SELECT ON public.quiz_kobo_submissions TO authenticated;
GRANT ALL ON public.quiz_kobo_submissions TO service_role;
ALTER TABLE public.quiz_kobo_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_kobo_submissions_read" ON public.quiz_kobo_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_owner_level(auth.uid())
    OR public.has_quiz_page_access(auth.uid())
  );

CREATE POLICY "quiz_kobo_submissions_admin_delete" ON public.quiz_kobo_submissions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_quiz_kobo_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quiz_kobo_configs_touch BEFORE UPDATE ON public.quiz_kobo_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_quiz_kobo_updated_at();
CREATE TRIGGER trg_quiz_kobo_submissions_touch BEFORE UPDATE ON public.quiz_kobo_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_quiz_kobo_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_kobo_submissions;