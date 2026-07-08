-- 1. Add a column that controls which test (if any) is currently OPEN for members.
--    NULL = quiz is closed for all members (default). Only an admin can open it.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS open_test_type text
  CHECK (open_test_type IN ('pre_test', 'post_test'));

-- Existing quizzes start closed.
UPDATE public.quizzes SET open_test_type = NULL WHERE open_test_type IS NOT NULL;

-- 2. Enforce the open/closed gate server-side inside the scoring RPC so members
--    can only submit for the test type an admin has explicitly opened.
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
  v_open text;
  v_published boolean;
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

  SELECT open_test_type, COALESCE(is_published, false)
    INTO v_open, v_published
  FROM public.quizzes
  WHERE id = p_quiz_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;

  -- Non-admins may only submit the test type an admin has opened, and only when
  -- the quiz is published.
  IF NOT v_is_admin THEN
    IF NOT v_published THEN
      RAISE EXCEPTION 'This quiz is not available';
    END IF;
    IF v_open IS NULL THEN
      RAISE EXCEPTION 'This quiz is currently closed';
    END IF;
    IF p_attempt_type <> v_open THEN
      RAISE EXCEPTION 'The % is not open right now', replace(p_attempt_type, '_', ' ');
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
    (quiz_id, user_id, attempt_type, answers, score, total_points, percentage, started_at, completed_at)
  VALUES
    (p_quiz_id, v_user, p_attempt_type, p_answers, v_score, v_total, v_pct, p_started_at, now())
  RETURNING id INTO v_attempt_id;

  RETURN QUERY SELECT v_attempt_id, v_score, v_total, v_pct;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, timestamptz) TO authenticated;