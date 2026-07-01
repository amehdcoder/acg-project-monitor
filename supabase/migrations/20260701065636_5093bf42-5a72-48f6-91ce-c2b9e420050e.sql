DROP POLICY IF EXISTS "Admins and owners can update IRF reports in their project" ON public.irf_reports;
CREATE POLICY "Admins and owners can update IRF reports in their project"
ON public.irf_reports
FOR UPDATE
USING (is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id))
WITH CHECK (is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id));