-- 1) reference_locations: null-scoped (global) rows are no longer readable by
-- every authenticated account. They stay available to the creator, to admins /
-- owners, and to any user who belongs to at least one project (field staff who
-- legitimately share the community/village registry).
DROP POLICY IF EXISTS "Users read reference locations in scope" ON public.reference_locations;

CREATE POLICY "Users read reference locations in scope"
ON public.reference_locations
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR is_admin((SELECT auth.uid()))
  OR is_owner_or_co_owner((SELECT auth.uid()))
  OR (project_id IS NOT NULL AND project_id = ANY (accessible_project_ids((SELECT auth.uid()))))
  OR (
    project_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.user_project_assignments upa
      WHERE upa.user_id = (SELECT auth.uid())
    )
  )
);

-- 2) voice_profiles: biometric voice donations + donor emails are no longer
-- visible to every admin. Only the platform owner, the person who requested the
-- donation, and the donor themselves can read a record.
DROP POLICY IF EXISTS "Admins view all voice profiles" ON public.voice_profiles;

CREATE POLICY "Owner donor and requester view voice profiles"
ON public.voice_profiles
FOR SELECT
TO authenticated
USING (
  is_owner((SELECT auth.uid()))
  OR donor_user_id = (SELECT auth.uid())
  OR requested_by = (SELECT auth.uid())
);