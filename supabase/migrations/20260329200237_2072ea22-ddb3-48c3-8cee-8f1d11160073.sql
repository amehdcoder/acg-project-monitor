
-- Add post_test_datetime to quizzes for exact date+time scheduling
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS post_test_datetime timestamptz;

-- Create quiz_user_assignments table for non-admin user access
CREATE TABLE public.quiz_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quiz_id, user_id)
);

ALTER TABLE public.quiz_user_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage assignments
CREATE POLICY "Admins manage quiz assignments"
ON public.quiz_user_assignments FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Users can view their own assignments
CREATE POLICY "Users view own quiz assignments"
ON public.quiz_user_assignments FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Assigned users can view their assigned quizzes (even unpublished? no, still need published)
CREATE POLICY "Assigned users view assigned quizzes"
ON public.quizzes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_user_assignments
    WHERE quiz_user_assignments.quiz_id = quizzes.id
    AND quiz_user_assignments.user_id = auth.uid()
  )
  AND is_published = true
);
