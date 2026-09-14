ALTER TABLE public.health_facilities ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.derive_facility_code(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(substr(regexp_replace(coalesce(_name, 'FAC'), '[^A-Za-z]', '', 'g'), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.set_facility_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.derive_facility_code(NEW.name);
  ELSE
    NEW.code := upper(regexp_replace(NEW.code, '[^A-Za-z0-9]', '', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_health_facilities_code ON public.health_facilities;
CREATE TRIGGER trg_health_facilities_code
BEFORE INSERT OR UPDATE OF code, name ON public.health_facilities
FOR EACH ROW EXECUTE FUNCTION public.set_facility_code();

UPDATE public.health_facilities
   SET code = public.derive_facility_code(name)
 WHERE code IS NULL OR btrim(code) = '';

-- Beneficiary case IDs: PREFIX-FACILITYCODE-YYYYMMDD-INDEX
CREATE OR REPLACE FUNCTION public.next_beneficiary_case_id(_module_id uuid, _facility_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cfg jsonb;
  _seq bigint;
  _prefix text;
  _width int;
  _code text;
BEGIN
  SELECT config INTO _cfg FROM public.programme_modules WHERE id = _module_id FOR UPDATE;
  IF _cfg IS NULL AND NOT EXISTS (SELECT 1 FROM public.programme_modules WHERE id = _module_id) THEN
    RAISE EXCEPTION 'Programme module % not found', _module_id;
  END IF;

  _prefix := COALESCE(NULLIF(_cfg #>> '{caseId,prefix}', ''), 'CiS2');
  _width := GREATEST(COALESCE((_cfg #>> '{caseId,width}')::int, 7), 1);

  SELECT COALESCE(
           MAX(NULLIF(regexp_replace(regexp_replace(case_id, '^.*-', ''), '\D', '', 'g'), '')::bigint),
           0) + 1
    INTO _seq
    FROM public.beneficiaries
   WHERE module_id = _module_id;

  UPDATE public.programme_modules SET case_seq = _seq WHERE id = _module_id;

  SELECT code INTO _code FROM public.health_facilities WHERE id = _facility_id;
  _code := COALESCE(NULLIF(btrim(_code), ''), 'GEN');

  RETURN _prefix || '-' || _code || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(_seq::text, _width, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) TO authenticated, service_role;