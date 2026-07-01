CREATE TABLE public.special_form_studio_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID,
  project_id UUID,
  form_name TEXT,
  action TEXT NOT NULL DEFAULT 'updated',
  summary TEXT,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_by UUID,
  changed_by_name TEXT,
  changed_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.special_form_studio_audit TO authenticated;
GRANT ALL ON public.special_form_studio_audit TO service_role;

ALTER TABLE public.special_form_studio_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view studio audit"
  ON public.special_form_studio_audit FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users record their own studio audit"
  ON public.special_form_studio_audit FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());

CREATE INDEX idx_special_form_studio_audit_form ON public.special_form_studio_audit (form_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.special_form_studio_audit;