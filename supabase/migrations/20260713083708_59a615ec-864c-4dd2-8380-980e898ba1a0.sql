
-- 1. Profile flag: Grant Quiz Page Access
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_quiz_access boolean NOT NULL DEFAULT false;

-- 2. Stamp project_id onto attempts for analytics alignment
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Backfill existing attempts from their quiz's project
UPDATE public.quiz_attempts a
SET project_id = q.project_id
FROM public.quizzes q
WHERE a.quiz_id = q.id AND a.project_id IS NULL;

-- 3. Helper: is the user a member of this project?
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_project_assignments
    WHERE user_id = _user_id
      AND project_id = _project_id
      AND (starts_at IS NULL OR starts_at <= now())
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- 4. Helper: does the user have Quiz Page Access?
CREATE OR REPLACE FUNCTION public.has_quiz_page_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT has_quiz_access FROM public.profiles WHERE user_id = _user_id LIMIT 1),
    false
  )
$$;

-- 5. Replace the broad "any authenticated user can see published quizzes" policy
--    with a project + quiz-access scoped one.
DROP POLICY IF EXISTS "Users view published quizzes" ON public.quizzes;

CREATE POLICY "Members with quiz access view project quizzes"
ON public.quizzes
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND public.has_quiz_page_access(auth.uid())
  AND public.is_project_member(auth.uid(), project_id)
);

-- 6. Block non-admins from self-granting has_quiz_access
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin(auth.uid()) OR public.is_owner(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.designation IS DISTINCT FROM OLD.designation THEN
    NEW.designation := OLD.designation;
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    NEW.approval_status := OLD.approval_status;
  END IF;
  IF NEW.is_co_owner IS DISTINCT FROM OLD.is_co_owner THEN
    NEW.is_co_owner := OLD.is_co_owner;
  END IF;
  IF NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
    NEW.is_owner := OLD.is_owner;
  END IF;
  IF NEW.has_quiz_access IS DISTINCT FROM OLD.has_quiz_access THEN
    NEW.has_quiz_access := OLD.has_quiz_access;
  END IF;

  RETURN NEW;
END;
$function$;

-- 7. Update submission RPC: enforce quiz access + membership for regular users,
--    and stamp the correct project_id automatically.
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_quiz_id uuid, p_attempt_type text, p_answers jsonb, p_started_at timestamp with time zone)
RETURNS TABLE(attempt_id uuid, score numeric, total_points numeric, percentage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_score numeric := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  v_attempt_id uuid;
  v_open text;
  v_published boolean;
  v_project uuid;
  v_is_admin boolean := public.is_admin(auth.uid());
  q record;
  v_answer text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_attempt_type NOT IN ('pre_test', 'post_test') THEN
    RAISE EXCEPTION 'Invalid attempt_type';
  END IF;

  SELECT open_test_type, COALESCE(is_published, false), project_id
    INTO v_open, v_published, v_project
  FROM public.quizzes
  WHERE id = p_quiz_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;

  IF NOT v_is_admin THEN
    IF NOT public.has_quiz_page_access(v_user) THEN
      RAISE EXCEPTION 'You do not have access to quizzes';
    END IF;
    IF NOT public.is_project_member(v_user, v_project) THEN
      RAISE EXCEPTION 'This quiz is not part of your project';
    END IF;
    IF NOT v_published THEN
      RAISE EXCEPTION 'This quiz is not available';
    END IF;
    IF v_open IS NULL THEN
      RAISE EXCEPTION 'This quiz is currently closed';
    END IF;
    IF p_attempt_type <> v_open THEN
      RAISE EXCEPTION 'The % is not open right now', replace(p_attempt_type, '_', ' ');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.quiz_attempts
      WHERE quiz_id = p_quiz_id AND user_id = v_user AND attempt_type = p_attempt_type
    ) THEN
      RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = '23505';
    END IF;
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
    (quiz_id, user_id, attempt_type, answers, score, total_points, percentage, started_at, completed_at, project_id)
  VALUES
    (p_quiz_id, v_user, p_attempt_type, p_answers, v_score, v_total, v_pct, p_started_at, now(), v_project)
  RETURNING id INTO v_attempt_id;

  RETURN QUERY SELECT v_attempt_id, v_score, v_total, v_pct;
END;
$function$;
