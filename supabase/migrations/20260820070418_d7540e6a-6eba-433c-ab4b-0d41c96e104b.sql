DROP POLICY IF EXISTS "Authenticated users can view archived geographies" ON public.microplan_geo_exclusions;

CREATE POLICY "geo_exclusions_read_scope"
ON public.microplan_geo_exclusions
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_row(auth.uid(), project_id, state, lga, ward, NULL::text)
  )
  OR (
    (NOT public.has_active_mda_lens(auth.uid()))
    AND (
      created_by = auth.uid()
      OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
    )
  )
);