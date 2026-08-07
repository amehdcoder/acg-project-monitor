CREATE POLICY "Lens users cannot update microplan entries"
ON public.microplan_entries AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (NOT public.has_active_mda_lens(auth.uid()))
  OR public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
)
WITH CHECK (
  (NOT public.has_active_mda_lens(auth.uid()))
  OR public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Lens users cannot delete microplan entries"
ON public.microplan_entries AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  (NOT public.has_active_mda_lens(auth.uid()))
  OR public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Lens users cannot request microplan deletions"
ON public.microplan_delete_requests AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  (NOT public.has_active_mda_lens(auth.uid()))
  OR public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
);