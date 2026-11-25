CREATE OR REPLACE FUNCTION public.next_beneficiary_case_id(_module_id uuid, _facility_id uuid DEFAULT NULL::uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cfg jsonb; _seq bigint; _prefix text; _width int; _code text; _stem text;
BEGIN
  SELECT config INTO _cfg FROM public.programme_modules WHERE id = _module_id FOR UPDATE;
  IF _cfg IS NULL AND NOT EXISTS (SELECT 1 FROM public.programme_modules WHERE id = _module_id) THEN
    RAISE EXCEPTION 'Programme module % not found', _module_id;
  END IF;
  _prefix := COALESCE(NULLIF(_cfg #>> '{caseId,prefix}', ''), 'CiS2');
  _width := GREATEST(COALESCE((_cfg #>> '{caseId,width}')::int, 7), 1);
  SELECT code INTO _code FROM public.health_facilities WHERE id = _facility_id;
  _code := COALESCE(NULLIF(btrim(_code), ''), 'GEN');
  _stem := _prefix || '-' || _code || '-';
  -- Per-facility serial: only IDs already in the short "<prefix>-<code>-<serial>" form count.
  SELECT COALESCE(MAX(substr(case_id, length(_stem) + 1)::bigint), 0) + 1
    INTO _seq FROM public.beneficiaries
   WHERE module_id = _module_id
     AND left(case_id, length(_stem)) = _stem
     AND substr(case_id, length(_stem) + 1) ~ '^\d{1,18}$';
  RETURN _stem || lpad(_seq::text, _width, '0');
END;
$function$;