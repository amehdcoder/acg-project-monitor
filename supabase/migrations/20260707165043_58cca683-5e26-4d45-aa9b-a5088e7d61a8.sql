
CREATE TABLE public.quiz_archived_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_attempt_id uuid,
  quiz_id uuid NOT NULL,
  user_id uuid NOT NULL,
  attempt_type text NOT NULL,
  answers jsonb,
  score numeric,
  total_points numeric,
  percentage numeric,
  started_at timestamptz,
  completed_at timestamptz,
  original_created_at timestamptz,
  archived_by uuid NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_archived_attempts TO authenticated;
GRANT ALL ON public.quiz_archived_attempts TO service_role;

ALTER TABLE public.quiz_archived_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage archived quiz attempts"
ON public.quiz_archived_attempts
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow the Owner to clear (delete) any quiz submission for fresh entries.
CREATE POLICY "Owner can delete any quiz attempt"
ON public.quiz_attempts
FOR DELETE
USING (public.is_owner(auth.uid()));
