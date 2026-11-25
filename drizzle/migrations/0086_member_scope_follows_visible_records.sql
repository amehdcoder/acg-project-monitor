CREATE OR REPLACE FUNCTION public.member_record_scope_ok(_uid uuid, _project uuid, _beneficiary uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _perms jsonb;
BEGIN
  IF _beneficiary IS NULL OR _uid IS NULL OR public.is_admin(_uid) THEN RETURN true; END IF;
  SELECT m.permissions INTO _perms FROM public.programme_team_members m
   WHERE m.project_id = _project AND m.user_id = _uid AND m.is_active
   ORDER BY m.updated_at DESC LIMIT 1;
  IF NOT COALESCE((_perms->>'record_only')::boolean, false)
     AND NOT COALESCE(jsonb_typeof(_perms->'beneficiary_ids') = 'array' AND jsonb_array_length(_perms->'beneficiary_ids') > 0, false)
     AND NOT COALESCE(jsonb_typeof(_perms->'components') = 'array' AND jsonb_array_length(_perms->'components') > 0, false)
  THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.beneficiaries b WHERE b.id = _beneficiary
    AND COALESCE(public.beneficiary_in_user_scope(_uid, b.id, b.project_id, b.created_by), false));
END $function$;