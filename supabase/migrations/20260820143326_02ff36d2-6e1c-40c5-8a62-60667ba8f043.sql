-- 1. Lock has_quiz_access against self-granting
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (designation IS DISTINCT FROM (SELECT p.designation FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (approval_status IS DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (COALESCE(is_co_owner,false) IS DISTINCT FROM COALESCE((SELECT p.is_co_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false))
  AND NOT (COALESCE(is_owner,false) IS DISTINCT FROM COALESCE((SELECT p.is_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false))
  AND NOT (COALESCE(is_active,true) IS DISTINCT FROM COALESCE((SELECT p.is_active FROM public.profiles p WHERE p.user_id = auth.uid()), true))
  AND NOT (COALESCE(has_quiz_access,false) IS DISTINCT FROM COALESCE((SELECT p.has_quiz_access FROM public.profiles p WHERE p.user_id = auth.uid()), false))
);

-- 2. Scope quiz Kobo submission reads to quizzes the user is actually tied to
CREATE OR REPLACE FUNCTION public.can_read_quiz_kobo(_quiz_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.is_owner_level(_user_id)
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
      )
$$;

DROP POLICY IF EXISTS "quiz_kobo_submissions_read" ON public.quiz_kobo_submissions;
CREATE POLICY "quiz_kobo_submissions_read"
ON public.quiz_kobo_submissions FOR SELECT TO authenticated
USING (public.can_read_quiz_kobo(quiz_id, auth.uid()));