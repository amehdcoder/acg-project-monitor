CREATE OR REPLACE FUNCTION public.beneficiary_in_user_scope(_uid uuid, _beneficiary uuid, _project uuid, _created_by uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _areas text[]; _ids jsonb;
BEGIN
  IF _created_by = _uid THEN RETURN true; END IF;
  IF NOT public.is_admin(_uid) THEN
    SELECT m.permissions->'beneficiary_ids' INTO _ids
      FROM public.programme_team_members m
     WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
     ORDER BY m.updated_at DESC LIMIT 1;
    IF jsonb_typeof(_ids) = 'array' AND jsonb_array_length(_ids) > 0
       AND NOT (_ids ? _beneficiary::text) THEN RETURN false; END IF;
  END IF;
  _areas := public.user_programme_areas(_uid, _project);
  IF _areas IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beneficiary_services s WHERE s.beneficiary_id = _beneficiary) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.beneficiary_services s
    WHERE s.beneficiary_id = _beneficiary AND public.programme_area_matches(s.component_key, _areas));
END $function$;