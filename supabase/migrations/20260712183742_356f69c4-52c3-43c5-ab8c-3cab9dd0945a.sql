-- Projects: drop the over-permissive catalog read. Assignment/admin/microplan
-- SELECT policies already provide scoped access.
DROP POLICY IF EXISTS "Authenticated users can view project catalog" ON public.projects;

-- Reference locations: replace USING(true) read with project-scoped access.
DROP POLICY IF EXISTS "Authenticated can read reference locations" ON public.reference_locations;

CREATE POLICY "Users read reference locations in scope"
ON public.reference_locations
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin(auth.uid())
  OR project_id IS NULL
  OR project_id IN (
    SELECT user_project_assignments.project_id
    FROM public.user_project_assignments
    WHERE user_project_assignments.user_id = auth.uid()
  )
);