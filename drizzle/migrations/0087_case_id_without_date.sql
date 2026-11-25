CREATE OR REPLACE FUNCTION public.next_beneficiary_case_id(_module_id uuid, _facility_id uuid DEFAULT NULL::uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cfg jsonb; _seq bigint; _prefix text; _width int; _code text;
BEGIN
  SELECT config INTO _cfg FROM public.programme_modules WHERE id = _module_id FOR UPDATE;
  IF _cfg IS NULL AND NOT EXISTS (SELECT 1 FROM public.programme_modules WHERE id = _module_id) THEN
    RAISE EXCEPTION 'Programme module % not found', _module_id;
  END IF;
  _prefix := COALESCE(NULLIF(_cfg #>> '{caseId,prefix}', ''), 'CiS2');
  _width := GREATEST(COALESCE((_cfg #>> '{caseId,width}')::int, 7), 1);
  SELECT COALESCE(MAX(NULLIF(regexp_replace(regexp_replace(case_id, '^.*-', ''), '\D', '', 'g'), '')::bigint), 0) + 1
    INTO _seq FROM public.beneficiaries WHERE module_id = _module_id;
  UPDATE public.programme_modules SET case_seq = _seq WHERE id = _module_id;
  SELECT code INTO _code FROM public.health_facilities WHERE id = _facility_id;
  _code := COALESCE(NULLIF(btrim(_code), ''), 'GEN');
  RETURN _prefix || '-' || _code || '-' || lpad(_seq::text, _width, '0');
END;
$function$;