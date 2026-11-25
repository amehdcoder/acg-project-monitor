CREATE OR REPLACE FUNCTION public.member_record_scope_ok(_uid uuid, _project uuid, _beneficiary uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _perms jsonb; _only boolean; _ids jsonb;
BEGIN
  IF _beneficiary IS NULL OR _uid IS NULL OR public.is_admin(_uid) THEN RETURN true; END IF;
  SELECT m.permissions INTO _perms FROM public.programme_team_members m
   WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
   ORDER BY m.updated_at DESC LIMIT 1;
  _only := COALESCE((_perms->>'record_only')::boolean, false);
  _ids := _perms->'beneficiary_ids';
  IF NOT _only AND NOT (jsonb_typeof(_ids) = 'array' AND jsonb_array_length(_ids) > 0) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.beneficiaries b WHERE b.id = _beneficiary AND b.created_by = _uid) THEN RETURN true; END IF;
  IF _only THEN RETURN false; END IF;
  RETURN _ids ? _beneficiary::text;
END $function$;
REVOKE ALL ON FUNCTION public.member_record_scope_ok(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_record_scope_ok(uuid, uuid, uuid) TO authenticated;

CREATE POLICY member_record_scope_guard ON public.beneficiary_services AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_record_scope_ok(auth.uid(), project_id, beneficiary_id));
CREATE POLICY member_record_scope_guard ON public.beneficiary_home_visits AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_record_scope_ok(auth.uid(), project_id, beneficiary_id));
CREATE POLICY member_record_scope_guard ON public.beneficiary_referrals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_record_scope_ok(auth.uid(), project_id, beneficiary_id));
CREATE POLICY member_record_scope_guard ON public.beneficiary_lesion_assessments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_record_scope_ok(auth.uid(), project_id, beneficiary_id));
CREATE POLICY member_record_scope_guard ON public.ntd_morbidity_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_record_scope_ok(auth.uid(), project_id, beneficiary_id));