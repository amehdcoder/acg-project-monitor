CREATE POLICY microplan_role_coverage_guard ON public.microplan_coverage AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_active_mda_lens(auth.uid()) OR public.microplan_project_access_level(auth.uid(),project_id)='dashboard' OR (submitted_by=auth.uid() AND public.microplan_project_access_level(auth.uid(),project_id)='entry'));
CREATE POLICY microplan_role_reconciliation_guard ON public.microplan_reconciliation AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_active_mda_lens(auth.uid()) OR public.microplan_project_access_level(auth.uid(),project_id)='dashboard' OR (submitted_by=auth.uid() AND public.microplan_project_access_level(auth.uid(),project_id)='entry'));
CREATE POLICY microplan_role_allocations_guard ON public.microplan_medicine_allocations AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_active_mda_lens(auth.uid()) OR public.microplan_project_access_level(auth.uid(),project_id)='dashboard');
CREATE POLICY microplan_role_gap_write_guard ON public.microplan_missing_communities AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_active_mda_lens(auth.uid()) OR public.microplan_project_access_level(auth.uid(),project_id)='dashboard')
WITH CHECK (public.is_admin(auth.uid()));