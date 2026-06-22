CREATE OR REPLACE FUNCTION public.submit_bloomberg_validation(_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_school_key text;
  v_now timestamptz := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_id := COALESCE(NULLIF(_row->>'id', '')::uuid, gen_random_uuid());
  v_school_key := NULLIF(_row->>'school_key', '');

  IF v_school_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bloomberg_schools WHERE school_key = v_school_key
  ) THEN
    v_school_key := NULL;
  END IF;

  INSERT INTO public.bloomberg_validations (
    id, validator_id, school_key, state, lga, ward, location,
    school_name, school_code, school_type, school_level, ownership,
    gps_lat, gps_lng, gps_accuracy, verification, enrolment,
    specified_locations, total_male, total_female, grand_total,
    evidence, remarks, status, submitted_at, created_at
  ) VALUES (
    v_id, v_user, v_school_key,
    NULLIF(_row->>'state', ''), NULLIF(_row->>'lga', ''), NULLIF(_row->>'ward', ''), NULLIF(_row->>'location', ''),
    NULLIF(_row->>'school_name', ''), NULLIF(_row->>'school_code', ''), NULLIF(_row->>'school_type', ''), NULLIF(_row->>'school_level', ''), NULLIF(_row->>'ownership', ''),
    NULLIF(_row->>'gps_lat', '')::double precision, NULLIF(_row->>'gps_lng', '')::double precision, NULLIF(_row->>'gps_accuracy', '')::double precision,
    COALESCE(_row->'verification', '{}'::jsonb), COALESCE(_row->'enrolment', '{}'::jsonb), COALESCE(_row->'specified_locations', '{}'::jsonb),
    NULLIF(_row->>'total_male', '')::int, NULLIF(_row->>'total_female', '')::int, NULLIF(_row->>'grand_total', '')::int,
    COALESCE(_row->'evidence', '{}'::jsonb), NULLIF(_row->>'remarks', ''), 'sent',
    COALESCE(NULLIF(_row->>'submitted_at', '')::timestamptz, v_now),
    COALESCE(NULLIF(_row->>'created_at', '')::timestamptz, v_now)
  )
  ON CONFLICT (id) DO UPDATE SET
    validator_id = v_user,
    school_key = EXCLUDED.school_key,
    state = EXCLUDED.state,
    lga = EXCLUDED.lga,
    ward = EXCLUDED.ward,
    location = EXCLUDED.location,
    school_name = EXCLUDED.school_name,
    school_code = EXCLUDED.school_code,
    school_type = EXCLUDED.school_type,
    school_level = EXCLUDED.school_level,
    ownership = EXCLUDED.ownership,
    gps_lat = EXCLUDED.gps_lat,
    gps_lng = EXCLUDED.gps_lng,
    gps_accuracy = EXCLUDED.gps_accuracy,
    verification = EXCLUDED.verification,
    enrolment = EXCLUDED.enrolment,
    specified_locations = EXCLUDED.specified_locations,
    total_male = EXCLUDED.total_male,
    total_female = EXCLUDED.total_female,
    grand_total = EXCLUDED.grand_total,
    evidence = EXCLUDED.evidence,
    remarks = EXCLUDED.remarks,
    status = 'sent',
    submitted_at = EXCLUDED.submitted_at,
    created_at = LEAST(public.bloomberg_validations.created_at, EXCLUDED.created_at),
    updated_at = v_now
  WHERE public.bloomberg_validations.validator_id = v_user
     OR public.is_owner_or_co_owner(v_user)
     OR public.is_admin(v_user);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission id already belongs to another validator' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'school_key', v_school_key, 'submitted_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) TO service_role;