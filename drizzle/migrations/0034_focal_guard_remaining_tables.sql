CREATE OR REPLACE FUNCTION public.focal_has_facility(_uid uuid, _fid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.facility_focal_persons WHERE user_id=_uid AND facility_id=_fid AND is_active) $$;
REVOKE ALL ON FUNCTION public.focal_has_facility(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.focal_has_facility(uuid, uuid) TO authenticated;

CREATE POLICY focal_livelihood_guard ON public.livelihood_assessments AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.facility_restricted_user(auth.uid())) WITH CHECK (NOT public.facility_restricted_user(auth.uid()));
CREATE POLICY focal_livelihood_guard ON public.livelihood_verifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.facility_restricted_user(auth.uid())) WITH CHECK (NOT public.facility_restricted_user(auth.uid()));
CREATE POLICY focal_livelihood_guard ON public.livelihood_opportunities AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.facility_restricted_user(auth.uid())) WITH CHECK (NOT public.facility_restricted_user(auth.uid()));
CREATE POLICY focal_brain_flags_guard ON public.brain_flags AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.facility_restricted_user(auth.uid()) OR (beneficiary_id IS NOT NULL AND public.focal_beneficiary_scope(auth.uid(), beneficiary_id)));
CREATE POLICY focal_facility_visits_guard ON public.facility_visits AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.facility_restricted_user(auth.uid()) OR public.focal_has_facility(auth.uid(), facility_id))
  WITH CHECK (NOT public.facility_restricted_user(auth.uid()) OR public.focal_has_facility(auth.uid(), facility_id));