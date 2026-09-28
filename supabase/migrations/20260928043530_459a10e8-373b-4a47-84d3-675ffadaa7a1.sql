DROP POLICY IF EXISTS "Signed-in users read microplan settings" ON public.microplan_project_settings;

CREATE POLICY "Project members read microplan settings" ON public.microplan_project_settings
  FOR SELECT TO authenticated
  USING (
    updated_by = auth.uid()
    OR project_key = 'all'
    OR public.is_owner_or_co_owner(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE microplan_project_settings.project_key = 'name:' || lower(btrim(p.name))
        AND public.is_project_member(auth.uid(), p.id)
    )
  );