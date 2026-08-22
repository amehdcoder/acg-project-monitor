
-- 1. Realtime: full row images so UPDATE/DELETE events carry quiz_id and pass filters/RLS
ALTER TABLE public.quiz_kobo_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.quiz_attempts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_attempts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Analytics access grants
CREATE TABLE IF NOT EXISTS public.quiz_analytics_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_analytics_access TO authenticated;
GRANT ALL ON public.quiz_analytics_access TO service_role;
ALTER TABLE public.quiz_analytics_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_quiz_analytics_access(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quiz_analytics_access a
    WHERE a.quiz_id = _quiz_id AND a.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "quiz_analytics_access_admin_all" ON public.quiz_analytics_access;
CREATE POLICY "quiz_analytics_access_admin_all" ON public.quiz_analytics_access
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));

DROP POLICY IF EXISTS "quiz_analytics_access_self_read" ON public.quiz_analytics_access;
CREATE POLICY "quiz_analytics_access_self_read" ON public.quiz_analytics_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Read policies for analytics grantees
DROP POLICY IF EXISTS "Analytics grantees view quiz" ON public.quizzes;
CREATE POLICY "Analytics grantees view quiz" ON public.quizzes
  FOR SELECT TO authenticated
  USING (public.has_quiz_analytics_access(id, auth.uid()));

DROP POLICY IF EXISTS "Analytics grantees view quiz questions" ON public.quiz_questions;
CREATE POLICY "Analytics grantees view quiz questions" ON public.quiz_questions
  FOR SELECT TO authenticated
  USING (public.has_quiz_analytics_access(quiz_id, auth.uid()));

DROP POLICY IF EXISTS "Analytics grantees view attempts" ON public.quiz_attempts;
CREATE POLICY "Analytics grantees view attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (public.has_quiz_analytics_access(quiz_id, auth.uid()));

DROP POLICY IF EXISTS "quiz_kobo_configs_analytics_read" ON public.quiz_kobo_configs;
CREATE POLICY "quiz_kobo_configs_analytics_read" ON public.quiz_kobo_configs
  FOR SELECT TO authenticated
  USING (public.has_quiz_analytics_access(quiz_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.can_read_quiz_kobo(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
      OR public.is_owner_level(_user_id)
      OR public.has_quiz_analytics_access(_quiz_id, _user_id)
      OR (
        public.has_quiz_page_access(_user_id)
        AND EXISTS (
          SELECT 1 FROM public.quizzes q
          WHERE q.id = _quiz_id
            AND (
              q.created_by = _user_id
              OR EXISTS (
                SELECT 1 FROM public.quiz_user_assignments a
                WHERE a.quiz_id = q.id AND a.user_id = _user_id
              )
              OR public.is_project_member(_user_id, q.project_id)
            )
        )
      );
$$;

-- 4. Archive store for Kobo-synced submissions
CREATE TABLE IF NOT EXISTS public.quiz_kobo_archived_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL,
  original_id uuid,
  kobo_submission_id text,
  participant_name text,
  participant_key text,
  assessment_type text,
  intervention_group text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  per_question jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  band text,
  submitted_at timestamptz,
  archived_by uuid,
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_kobo_archived_quiz ON public.quiz_kobo_archived_submissions (quiz_id, archived_at DESC);
GRANT SELECT, INSERT, DELETE ON public.quiz_kobo_archived_submissions TO authenticated;
GRANT ALL ON public.quiz_kobo_archived_submissions TO service_role;
ALTER TABLE public.quiz_kobo_archived_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_kobo_archived_admin_all" ON public.quiz_kobo_archived_submissions;
CREATE POLICY "quiz_kobo_archived_admin_all" ON public.quiz_kobo_archived_submissions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));
