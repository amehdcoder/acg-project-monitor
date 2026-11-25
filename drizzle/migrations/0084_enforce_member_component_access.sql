CREATE OR REPLACE FUNCTION public.member_components(_uid uuid, _project uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_admin(_uid) THEN NULL
    ELSE (SELECT CASE WHEN jsonb_typeof(m.permissions->'components') = 'array' AND jsonb_array_length(m.permissions->'components') > 0
                 THEN ARRAY(SELECT jsonb_array_elements_text(m.permissions->'components')) END
          FROM public.programme_team_members m
          WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
          ORDER BY m.updated_at DESC LIMIT 1) END
$function$;

CREATE OR REPLACE FUNCTION public.member_component_ok(_uid uuid, _project uuid, _component text, _recorded_by uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c text[];
BEGIN
  IF _uid IS NULL OR _component IS NULL OR _recorded_by = _uid THEN RETURN true; END IF;
  _c := public.member_components(_uid, _project);
  RETURN _c IS NULL OR _component = ANY(_c);
END $function$;

REVOKE ALL ON FUNCTION public.member_components(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_component_ok(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_components(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_component_ok(uuid, uuid, text, uuid) TO authenticated;

CREATE POLICY member_component_guard ON public.beneficiary_services AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_component_ok(auth.uid(), project_id, component_key, recorded_by));
CREATE POLICY member_component_guard ON public.beneficiary_referrals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_component_ok(auth.uid(), project_id, component_key, NULL));
CREATE POLICY member_component_guard ON public.beneficiary_lesion_assessments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.member_component_ok(auth.uid(), project_id, component_key, NULL));

CREATE OR REPLACE FUNCTION public.beneficiary_in_user_scope(_uid uuid, _beneficiary uuid, _project uuid, _created_by uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _areas text[]; _perms jsonb; _ids jsonb; _comps text[];
BEGIN
  IF _created_by = _uid THEN RETURN true; END IF;
  IF NOT public.is_admin(_uid) THEN
    SELECT m.permissions INTO _perms
      FROM public.programme_team_members m
     WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
     ORDER BY m.updated_at DESC LIMIT 1;
    IF (_perms->>'record_only')::boolean IS TRUE THEN RETURN false; END IF;
    _ids := _perms->'beneficiary_ids';
    IF jsonb_typeof(_ids) = 'array' AND jsonb_array_length(_ids) > 0
       AND NOT (_ids ? _beneficiary::text) THEN RETURN false; END IF;
    IF jsonb_typeof(_perms->'components') = 'array' AND jsonb_array_length(_perms->'components') > 0 THEN
      _comps := ARRAY(SELECT jsonb_array_elements_text(_perms->'components'));
      IF EXISTS (SELECT 1 FROM public.beneficiary_services s WHERE s.beneficiary_id = _beneficiary)
         AND NOT EXISTS (SELECT 1 FROM public.beneficiary_services s
                         WHERE s.beneficiary_id = _beneficiary AND s.component_key = ANY(_comps)) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  _areas := public.user_programme_areas(_uid, _project);
  IF _areas IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beneficiary_services s WHERE s.beneficiary_id = _beneficiary) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.beneficiary_services s
    WHERE s.beneficiary_id = _beneficiary AND public.programme_area_matches(s.component_key, _areas));
END $function$;