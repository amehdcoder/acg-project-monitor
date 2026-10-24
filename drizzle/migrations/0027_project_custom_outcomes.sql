CREATE TABLE public.project_custom_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('completed','suspended','exited')),
  name text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_custom_outcomes_uniq ON public.project_custom_outcomes (project_id, component_key, action, lower(name));
GRANT SELECT, INSERT, DELETE ON public.project_custom_outcomes TO authenticated;
GRANT ALL ON public.project_custom_outcomes TO service_role;
ALTER TABLE public.project_custom_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project users read custom outcomes" ON public.project_custom_outcomes FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));
CREATE POLICY "project users add custom outcomes" ON public.project_custom_outcomes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid()))));
CREATE POLICY "admins remove custom outcomes" ON public.project_custom_outcomes FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_custom_outcomes;