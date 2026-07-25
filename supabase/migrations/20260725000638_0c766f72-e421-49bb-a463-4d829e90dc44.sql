
-- Tighten microplan_entries SELECT: non-admin project members can only see their OWN entries.
DROP POLICY IF EXISTS "Read microplan entries (geo-scoped)" ON public.microplan_entries;
CREATE POLICY "Read microplan entries (scoped)" ON public.microplan_entries
FOR SELECT USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.can_read_microplan_entry(
      auth.uid(), state, lga, ward, flhf_name, community_name, settlement_name, project_id
    )
  )
);

-- Medicine allocations: dashboard-only data → admins + creators only.
DROP POLICY IF EXISTS "Read medicine allocations" ON public.microplan_medicine_allocations;
CREATE POLICY "Admins and creators read medicine allocations"
ON public.microplan_medicine_allocations
FOR SELECT USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR created_by = auth.uid()
);

-- Missing communities: dashboard/gap analysis → admins only.
DROP POLICY IF EXISTS "Microplanning users view missing communities" ON public.microplan_missing_communities;
CREATE POLICY "Admins view missing communities"
ON public.microplan_missing_communities
FOR SELECT USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
);
