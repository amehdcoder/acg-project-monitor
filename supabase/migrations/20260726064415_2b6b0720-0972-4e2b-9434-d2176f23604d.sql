
CREATE TABLE IF NOT EXISTS public.kobo_form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kobo_server_url text NOT NULL DEFAULT 'https://kf.kobotoolbox.org',
  form_uid text NOT NULL,
  form_title text,
  api_token text NOT NULL,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  form_status text NOT NULL DEFAULT 'existing' CHECK (form_status IN ('existing','empty','deployed')),
  last_inspected_at timestamptz,
  last_deployed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_uid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kobo_form_configs TO authenticated;
GRANT ALL ON public.kobo_form_configs TO service_role;

ALTER TABLE public.kobo_form_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage kobo form configs"
  ON public.kobo_form_configs
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = kobo_form_configs.project_id
        AND p.created_by = auth.uid()
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = kobo_form_configs.project_id
        AND p.created_by = auth.uid()
    ))
  );

CREATE INDEX IF NOT EXISTS kobo_form_configs_form_uid_idx ON public.kobo_form_configs(form_uid);
CREATE INDEX IF NOT EXISTS kobo_form_configs_project_id_idx ON public.kobo_form_configs(project_id);

CREATE TRIGGER kobo_form_configs_touch
  BEFORE UPDATE ON public.kobo_form_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
