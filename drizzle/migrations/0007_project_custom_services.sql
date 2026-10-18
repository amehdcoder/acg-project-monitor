CREATE TABLE public.project_custom_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  name text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_custom_services_uniq ON public.project_custom_services (project_id, component_key, lower(name));
GRANT SELECT, INSERT, DELETE ON public.project_custom_services TO authenticated;
GRANT ALL ON public.project_custom_services TO service_role;
ALTER TABLE public.project_custom_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project users read custom services" ON public.project_custom_services FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));
CREATE POLICY "project users add custom services" ON public.project_custom_services FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid()))));
CREATE POLICY "admins remove custom services" ON public.project_custom_services FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_custom_services;