-- Make published quizzes visible to ALL members of the project by default,
-- without needing the per-user Quiz Page Access toggle.
DROP POLICY IF EXISTS "Members with quiz access view project quizzes" ON public.quizzes;

CREATE POLICY "Project members view published project quizzes"
ON public.quizzes
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND public.is_project_member(auth.uid(), project_id)
);

-- Submission RPC: drop the quiz-access gate; project membership is sufficient.
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