-- Tier 1: project-assigned members can add/edit/delete their OWN microplan entries
-- for projects they are assigned to (in addition to existing form-access/admin policies).

CREATE POLICY "Project members can insert own microplan entries"
ON public.microplan_entries
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid()
      AND upa.project_id = microplan_entries.project_id
  )
);

CREATE POLICY "Project members can update own microplan entries"
ON public.microplan_entries
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid()
      AND upa.project_id = microplan_entries.project_id
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid()
      AND upa.project_id = microplan_entries.project_id
  )
);

CREATE POLICY "Project members can delete own microplan entries"
ON public.microplan_entries
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid()
      AND upa.project_id = microplan_entries.project_id
  )
);