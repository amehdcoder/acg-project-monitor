CREATE TABLE public.quiz_copy_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_quiz_id uuid NOT NULL,
  new_quiz_id uuid,
  source_project_id uuid,
  target_project_id uuid NOT NULL,
  target_project_name text,
  source_quiz_title text,
  copied_by uuid NOT NULL,
  copied_by_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.quiz_copy_audit TO authenticated;
GRANT ALL ON public.quiz_copy_audit TO service_role;

ALTER TABLE public.quiz_copy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can log their own quiz copies"
ON public.quiz_copy_audit
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = copied_by);

CREATE POLICY "Admins can view quiz copy audit"
ON public.quiz_copy_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'systems_admin') OR auth.uid() = copied_by);