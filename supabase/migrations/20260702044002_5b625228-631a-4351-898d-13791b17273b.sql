-- Restrict submission_edit_audit reads to admins/owners or the editor
DROP POLICY IF EXISTS "Authenticated can read edit audit" ON public.submission_edit_audit;
CREATE POLICY "Read edit audit (admin/owner/editor)"
ON public.submission_edit_audit
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_owner_or_co_owner(auth.uid())
  OR changed_by = auth.uid()
);

-- Restrict acsm_duplicate_overrides reads to admins/owners or project members
DROP POLICY IF EXISTS "Authenticated can read duplicate overrides" ON public.acsm_duplicate_overrides;
CREATE POLICY "Read duplicate overrides (admin/owner/member)"
ON public.acsm_duplicate_overrides
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_owner_or_co_owner(auth.uid())
  OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
);

-- Restrict irf_form_access reads to admins or the user themselves / matching designation
DROP POLICY IF EXISTS "Authenticated can read irf form access" ON public.irf_form_access;
CREATE POLICY "Read irf form access (admin/self)"
ON public.irf_form_access
FOR SELECT
TO authenticated
USING (
  public.is_irf_admin()
  OR public.is_owner_or_co_owner(auth.uid())
  OR (grant_type = 'user' AND user_id = auth.uid())
  OR (
    grant_type = 'designation'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.designation::text = irf_form_access.designation
    )
  )
);

-- Restrict special_form_studio_audit reads to admins/owners
DROP POLICY IF EXISTS "Authenticated can view studio audit" ON public.special_form_studio_audit;
CREATE POLICY "Read studio audit (admin/owner)"
ON public.special_form_studio_audit
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_owner_or_co_owner(auth.uid())
);