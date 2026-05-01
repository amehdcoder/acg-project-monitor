-- Allow project-assigned users to view all microplan entries in their assigned projects.
-- Existing policies (form_access, admin, owner) remain in place; this is additive.

CREATE POLICY "Project members can view microplan entries"
ON public.microplan_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid()
      AND upa.project_id = microplan_entries.project_id
  )
);
