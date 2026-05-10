
-- 1. ces_keyframes: require ownership of parent session for INSERT (and SELECT)
DROP POLICY IF EXISTS "Authenticated can insert CES keyframes" ON public.ces_keyframes;
DROP POLICY IF EXISTS "Authenticated can view CES keyframes" ON public.ces_keyframes;

CREATE POLICY "Session owner or admin can insert CES keyframes"
ON public.ces_keyframes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ces_capture_sessions s
    WHERE s.id = ces_keyframes.session_id
      AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Session owner or admin can view CES keyframes"
ON public.ces_keyframes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ces_capture_sessions s
    WHERE s.id = ces_keyframes.session_id
      AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))
  )
);

-- 2. ces_households: tighten UPDATE (mirror DELETE)
DROP POLICY IF EXISTS "Authenticated can update CES households" ON public.ces_households;
CREATE POLICY "Creator or admin can update CES households"
ON public.ces_households
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- 3. submission_versions: restrict SELECT to submission owner or admin
DROP POLICY IF EXISTS "Authenticated users can view submission versions" ON public.submission_versions;
CREATE POLICY "Submission owner or admin can view submission versions"
ON public.submission_versions
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.form_submissions fs
    WHERE fs.id = submission_versions.submission_id
      AND fs.user_id = auth.uid()
  )
);

-- 4. user_roles: replace permissive owner-protection policies with restrictive admin-only
DROP POLICY IF EXISTS "Owner protection on role changes" ON public.user_roles;
DROP POLICY IF EXISTS "Owner protection on role deletion" ON public.user_roles;

-- Restrictive: actor MUST be a super_admin or systems_admin to UPDATE
CREATE POLICY "Only admins can update user roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Restrictive: actor MUST be admin to DELETE; never delete the owner's role row
CREATE POLICY "Only admins can delete user roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id AND p.is_owner = true
  )
);

-- 5. microplan_allocation_history: history is written by SECURITY DEFINER triggers, but
-- add an explicit admin-only INSERT policy so the access intent is documented and any
-- direct API write is constrained to admins.
CREATE POLICY "Admins can insert allocation history"
ON public.microplan_allocation_history
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- 6. quiz_questions: hide correct_answer from non-admins by tightening SELECT to admins
-- and exposing questions + server-side scoring through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Users view quiz questions" ON public.quiz_questions;

CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_attempt(p_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  question_text text,
  question_type text,
  options jsonb,
  points numeric,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.quiz_id, q.question_text, q.question_type, q.options, q.points, q.sort_order
  FROM public.quiz_questions q
  JOIN public.quizzes z ON z.id = q.quiz_id
  WHERE q.quiz_id = p_quiz_id
    AND (z.is_published = true OR public.is_admin(auth.uid()))
    AND auth.uid() IS NOT NULL
  ORDER BY q.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_questions_for_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_attempt_type text,
  p_answers jsonb,
  p_started_at timestamptz
)
RETURNS TABLE (
  attempt_id uuid,
  score numeric,
  total_points numeric,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_score numeric := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  v_attempt_id uuid;
  q record;
  v_answer text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_attempt_type NOT IN ('pre_test', 'post_test') THEN
    RAISE EXCEPTION 'Invalid attempt_type';
  END IF;

  FOR q IN
    SELECT id, correct_answer, points
    FROM public.quiz_questions
    WHERE quiz_id = p_quiz_id
  LOOP
    v_total := v_total + COALESCE(q.points, 0);
    v_answer := p_answers ->> q.id::text;
    IF v_answer IS NOT NULL AND v_answer = q.correct_answer THEN
      v_score := v_score + COALESCE(q.points, 0);
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    v_pct := round((v_score / v_total) * 10000) / 100.0;
  END IF;

  INSERT INTO public.quiz_attempts
    (quiz_id, user_id, attempt_type, answers, score, total_points, percentage, started_at, completed_at)
  VALUES
    (p_quiz_id, v_user, p_attempt_type, p_answers, v_score, v_total, v_pct, p_started_at, now())
  RETURNING id INTO v_attempt_id;

  RETURN QUERY SELECT v_attempt_id, v_score, v_total, v_pct;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, timestamptz) TO authenticated;

-- 7. storage.objects: restrict chat-attachments SELECT to uploader, admins,
-- or members of any chat group whose messages reference the file.
DROP POLICY IF EXISTS "Authenticated group members can view chat attachments" ON storage.objects;
CREATE POLICY "Chat attachment access scoped to group members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.chat_messages m
      JOIN public.chat_group_members gm
        ON gm.chat_group_id = m.chat_group_id
       AND gm.user_id = auth.uid()
      WHERE m.attachment_url LIKE '%' || storage.objects.name
    )
  )
);
