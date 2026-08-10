-- 1. case_notes: enforce the visibility column
DROP POLICY IF EXISTS "Access notes for accessible cases" ON public.case_notes;

CREATE POLICY "Read case notes respecting visibility"
ON public.case_notes
FOR SELECT
TO authenticated
USING (
  can_access_case(auth.uid(), case_id)
  AND (
    coalesce(visibility, 'team') <> 'private'
    OR author_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
);

CREATE POLICY "Write case notes for accessible cases"
ON public.case_notes
FOR INSERT
TO authenticated
WITH CHECK (
  can_access_case(auth.uid(), case_id)
  AND (author_id = auth.uid() OR public.is_admin(auth.uid()))
);

CREATE POLICY "Update own or admin case notes"
ON public.case_notes
FOR UPDATE
TO authenticated
USING (
  can_access_case(auth.uid(), case_id)
  AND (author_id = auth.uid() OR public.is_admin(auth.uid()))
)
WITH CHECK (
  can_access_case(auth.uid(), case_id)
  AND (author_id = auth.uid() OR public.is_admin(auth.uid()))
);

CREATE POLICY "Delete own or admin case notes"
ON public.case_notes
FOR DELETE
TO authenticated
USING (
  can_access_case(auth.uid(), case_id)
  AND (author_id = auth.uid() OR public.is_admin(auth.uid()))
);

-- 2. kobo_form_configs: restrict the plaintext api_token to admins/owners only
DROP POLICY IF EXISTS "Admins manage kobo form configs" ON public.kobo_form_configs;

CREATE POLICY "Only admins manage kobo form configs"
ON public.kobo_form_configs
FOR ALL
TO authenticated
USING (
  public.is_owner_level(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
)
WITH CHECK (
  public.is_owner_level(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
);