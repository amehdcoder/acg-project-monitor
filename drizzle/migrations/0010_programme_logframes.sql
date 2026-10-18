CREATE TABLE public.programme_logframes (
  project_id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_logframes TO authenticated;
GRANT ALL ON public.programme_logframes TO service_role;
ALTER TABLE public.programme_logframes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logframe access for officers and admins" ON public.programme_logframes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (SELECT 1 FROM projects p WHERE p.id = programme_logframes.project_id AND p.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM programme_report_officers o WHERE o.project_id = programme_logframes.project_id AND o.user_id = auth.uid()))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (SELECT 1 FROM projects p WHERE p.id = programme_logframes.project_id AND p.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM programme_report_officers o WHERE o.project_id = programme_logframes.project_id AND o.user_id = auth.uid()));