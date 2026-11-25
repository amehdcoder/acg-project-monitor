CREATE OR REPLACE FUNCTION public.member_record_scope_ok(_uid uuid, _project uuid, _beneficiary uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _perms jsonb; _only boolean; _ids jsonb; _limited boolean;
BEGIN
  IF _beneficiary IS NULL OR _uid IS NULL OR public.is_admin(_uid) THEN RETURN true; END IF;
  SELECT m.permissions INTO _perms FROM public.programme_team_members m
   WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
   ORDER BY m.updated_at DESC LIMIT 1;
  _only := COALESCE((_perms->>'record_only')::boolean, false);
  _ids := _perms->'beneficiary_ids';
  _limited := COALESCE(jsonb_typeof(_ids) = 'array' AND jsonb_array_length(_ids) > 0, false);
  IF NOT _only AND NOT _limited THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.beneficiaries b WHERE b.id = _beneficiary AND b.created_by = _uid) THEN RETURN true; END IF;
  IF _only THEN RETURN false; END IF;
  RETURN COALESCE(_ids ? _beneficiary::text, false);
END $function$;