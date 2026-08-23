DROP POLICY IF EXISTS gps_hist_read ON public.gps_verification_history;
CREATE POLICY gps_hist_read ON public.gps_verification_history
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_owner_level(auth.uid())
  OR public.has_active_mda_lens(auth.uid())
  OR recorded_by = auth.uid()
);

DROP POLICY IF EXISTS gps_ovr_read ON public.gps_verification_overrides;
CREATE POLICY gps_ovr_read ON public.gps_verification_overrides
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_owner_level(auth.uid())
  OR public.has_active_mda_lens(auth.uid())
  OR reviewed_by = auth.uid()
);