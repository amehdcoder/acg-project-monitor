
-- microplan_entries: replace blanket SELECT with scoped policy
DROP POLICY IF EXISTS "Authenticated users can view all microplan entries" ON public.microplan_entries;

CREATE POLICY "Scoped read of microplan entries"
ON public.microplan_entries
FOR SELECT
TO authenticated
USING (
  is_owner(auth.uid())
  OR is_owner_or_co_owner(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid() AND upa.project_id = microplan_entries.project_id
  )
  OR EXISTS (
    SELECT 1 FROM public.microplan_form_access mfa
    WHERE mfa.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_page_access apa
    WHERE apa.user_id = auth.uid() AND apa.page_id = 'microplanning'
  )
);

-- bmz_project_assignments: scope SELECT to admins/owners or project members
DROP POLICY IF EXISTS "bmz_assignments_select" ON public.bmz_project_assignments;

CREATE POLICY "bmz_assignments_select_scoped"
ON public.bmz_project_assignments
FOR SELECT
TO authenticated
USING (
  is_owner(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid() AND upa.project_id = bmz_project_assignments.project_id
  )
);

-- microplan_project_grants: scope SELECT to admins/owners or project members
DROP POLICY IF EXISTS "Authenticated can view microplan project grants" ON public.microplan_project_grants;

CREATE POLICY "Scoped read of microplan project grants"
ON public.microplan_project_grants
FOR SELECT
TO authenticated
USING (
  is_owner(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.admin_page_access apa
    WHERE apa.user_id = auth.uid() AND apa.page_id = 'microplanning'
  )
  OR EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = auth.uid() AND upa.project_id = microplan_project_grants.project_id
  )
);

-- microplan_project_exclusions: scope SELECT to admins/owners or the excluded user
DROP POLICY IF EXISTS "Authenticated can view microplan exclusions" ON public.microplan_project_exclusions;

CREATE POLICY "Scoped read of microplan exclusions"
ON public.microplan_project_exclusions
FOR SELECT
TO authenticated
USING (
  is_owner(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.admin_page_access apa
    WHERE apa.user_id = auth.uid() AND apa.page_id = 'microplanning'
  )
  OR user_id = auth.uid()
);
