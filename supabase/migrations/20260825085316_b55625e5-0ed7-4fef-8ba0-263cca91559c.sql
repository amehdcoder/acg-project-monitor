-- 1) Internal AI tuning data: admin-only reads
DROP POLICY IF EXISTS ai_policy_read ON public.ai_chat_policy;
CREATE POLICY ai_policy_read ON public.ai_chat_policy
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));

DROP POLICY IF EXISTS ai_route_stats_read ON public.ai_route_stats;
CREATE POLICY ai_route_stats_read ON public.ai_route_stats
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_level(auth.uid()));

-- 2) GPS verification: apply MDA Lens geographic scoping
DROP POLICY IF EXISTS gps_hist_read ON public.gps_verification_history;
CREATE POLICY gps_hist_read ON public.gps_verification_history
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_owner_level(auth.uid())
    OR recorded_by = auth.uid()
    OR (
      public.has_active_mda_lens(auth.uid())
      AND public.mda_lens_allows_row(auth.uid(), NULL::uuid, state, lga, ward, NULL::text)
    )
  );

DROP POLICY IF EXISTS gps_ovr_read ON public.gps_verification_overrides;
CREATE POLICY gps_ovr_read ON public.gps_verification_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_owner_level(auth.uid())
    OR reviewed_by = auth.uid()
    OR (
      public.has_active_mda_lens(auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.gps_verification_history h
        WHERE h.loc_key = gps_verification_overrides.loc_key
          AND public.mda_lens_allows_row(auth.uid(), NULL::uuid, h.state, h.lga, h.ward, NULL::text)
      )
    )
  );