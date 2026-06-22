CREATE TABLE public.standard_form_assignment_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id uuid NOT NULL,
  project_id uuid,
  form_code text,
  action text NOT NULL,
  detail text,
  changed_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.standard_form_assignment_audit TO authenticated;
GRANT ALL ON public.standard_form_assignment_audit TO service_role;

ALTER TABLE public.standard_form_assignment_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view standard form audit"
ON public.standard_form_assignment_audit
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE POLICY "Admins can insert standard form audit"
ON public.standard_form_assignment_audit
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()))
);

CREATE INDEX idx_std_form_audit_user ON public.standard_form_assignment_audit (target_user_id);
CREATE INDEX idx_std_form_audit_project ON public.standard_form_assignment_audit (project_id);
CREATE INDEX idx_std_form_audit_created ON public.standard_form_assignment_audit (created_at DESC);