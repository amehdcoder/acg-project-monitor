ALTER TABLE public.case_referrals ADD COLUMN IF NOT EXISTS assigned_to uuid;

DROP POLICY IF EXISTS "Users can view cases they own or in assigned projects" ON public.cases;

CREATE POLICY "Users can view cases they own or in assigned projects"
ON public.cases
FOR SELECT
USING (
  owner_id = auth.uid()
  OR project_id IN (
    SELECT user_project_assignments.project_id
    FROM user_project_assignments
    WHERE user_project_assignments.user_id = auth.uid()
  )
  OR is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.case_permissions cp
    WHERE cp.case_id = cases.id
      AND cp.shared_with_user_id = auth.uid()
  )
);