CREATE TABLE public.project_access_profiles (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, role_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_access_profiles TO authenticated;
GRANT ALL ON public.project_access_profiles TO service_role;
ALTER TABLE public.project_access_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project users read access profiles" ON public.project_access_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR project_id = ANY(public.accessible_project_ids(auth.uid())));
CREATE POLICY "Super admins insert access profiles" ON public.project_access_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins update access profiles" ON public.project_access_profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins delete access profiles" ON public.project_access_profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));