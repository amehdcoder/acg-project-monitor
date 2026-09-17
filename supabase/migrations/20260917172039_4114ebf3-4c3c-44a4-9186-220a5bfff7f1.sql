
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS cdd_id uuid REFERENCES public.mmdp_cdds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referring_facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_cdd ON public.beneficiaries(cdd_id);

CREATE TABLE IF NOT EXISTS public.mmdp_cdd_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  cdd_id uuid NOT NULL REFERENCES public.mmdp_cdds(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.mmdp_potential_cases(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  awarded_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reason)
);

GRANT SELECT ON public.mmdp_cdd_points TO authenticated;
GRANT ALL ON public.mmdp_cdd_points TO service_role;

ALTER TABLE public.mmdp_cdd_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and facility teams read CDD points"
ON public.mmdp_cdd_points FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.mmdp_cdds c
    WHERE c.id = mmdp_cdd_points.cdd_id
      AND public.facility_access_level_for(auth.uid(), c.facility_id) IS NOT NULL
  )
);

CREATE TRIGGER update_mmdp_cdd_points_updated_at
BEFORE UPDATE ON public.mmdp_cdd_points
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.award_mmdp_cdd_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mmdp_cdd_points WHERE case_id = NEW.id;

  IF NEW.cdd_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending' THEN
    INSERT INTO public.mmdp_cdd_points (project_id, cdd_id, case_id, points, reason, awarded_on)
    VALUES (NEW.project_id, NEW.cdd_id, NEW.id, 1, 'case_found', NEW.search_date);
  END IF;

  IF NEW.status IN ('confirmed', 'referred', 'registered') THEN
    INSERT INTO public.mmdp_cdd_points (project_id, cdd_id, case_id, points, reason, awarded_on)
    VALUES (NEW.project_id, NEW.cdd_id, NEW.id, 10, 'case_confirmed',
            COALESCE(NEW.confirmed_at::date, NEW.search_date));
  END IF;

  IF NEW.status = 'registered' THEN
    INSERT INTO public.mmdp_cdd_points (project_id, cdd_id, case_id, points, reason, awarded_on)
    VALUES (NEW.project_id, NEW.cdd_id, NEW.id, 5, 'case_registered', CURRENT_DATE);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_mmdp_cdd_points ON public.mmdp_potential_cases;
CREATE TRIGGER trg_award_mmdp_cdd_points
AFTER INSERT OR UPDATE OF status, cdd_id, confirmed_at ON public.mmdp_potential_cases
FOR EACH ROW EXECUTE FUNCTION public.award_mmdp_cdd_points();

CREATE OR REPLACE FUNCTION public.register_confirmed_mmdp_case(_case_id uuid, _facility_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.mmdp_potential_cases%ROWTYPE;
  v_uid uuid := auth.uid();
  v_case_code text;
  v_beneficiary_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO c FROM public.mmdp_potential_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Potential case not found.';
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR public.can_record_at_facility(v_uid, _facility_id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to register cases at this facility.';
  END IF;

  IF _facility_id <> c.facility_id
     AND (c.referred_to_facility_id IS NULL OR c.referred_to_facility_id <> _facility_id) THEN
    RAISE EXCEPTION 'This case was not referred to that facility.';
  END IF;

  IF c.status NOT IN ('confirmed', 'referred') THEN
    RAISE EXCEPTION 'Only a clinician-confirmed case can be registered.';
  END IF;

  IF c.beneficiary_id IS NOT NULL THEN
    RETURN c.beneficiary_id;
  END IF;

  IF c.module_id IS NULL THEN
    RAISE EXCEPTION 'This case is not linked to a programme module.';
  END IF;

  v_case_code := public.next_beneficiary_case_id(c.module_id, _facility_id);

  INSERT INTO public.beneficiaries (
    module_id, project_id, facility_id, case_id, full_name, profile,
    status, photo_url, latitude, longitude, state, lga, ward, village, created_by,
    cdd_id, referring_facility_id
  ) VALUES (
    c.module_id, c.project_id, _facility_id, v_case_code, c.full_name,
    jsonb_strip_nulls(jsonb_build_object(
      'sex', c.sex,
      'gender', c.sex,
      'age', c.age,
      'phone', c.phone,
      'mmdp_condition', COALESCE(c.confirmed_condition, c.condition),
      'affected_side', c.affected_side,
      'duration_years', c.duration_years,
      'acute_attacks_last_year', c.acute_attacks_last_year,
      'identified_by_cdd', c.cdd_id,
      'case_search_date', c.search_date
    )),
    'active',
    NULLIF(c.photos->>0, ''),
    c.latitude, c.longitude, c.state, c.lga, c.ward, COALESCE(c.community, c.address),
    v_uid, c.cdd_id, c.facility_id
  )
  RETURNING id INTO v_beneficiary_id;

  IF c.confirmed_stage IS NOT NULL OR c.photos <> '[]'::jsonb THEN
    INSERT INTO public.beneficiary_lesion_assessments (
      project_id, module_id, beneficiary_id, condition, body_site, assessed_on,
      image_path, area_mm2, area_fraction, stage, stage_label,
      confirmed_stage, confirmed_stage_label, confirmed_by, confirmed_at,
      analysis, notes, created_by
    ) VALUES (
      c.project_id, c.module_id, v_beneficiary_id,
      COALESCE(c.confirmed_condition, c.condition), c.affected_side, c.search_date,
      NULLIF(c.photos->>0, ''),
      NULLIF(c.analysis->>'area_mm2', '')::numeric,
      NULLIF(c.analysis->>'area_fraction', '')::numeric,
      c.confirmed_stage, c.confirmed_stage_label,
      c.confirmed_stage, c.confirmed_stage_label, c.confirmed_by, c.confirmed_at,
      jsonb_build_object('source', 'cdd_case_search',
                         'criteria', c.clinical_criteria,
                         'measurements', c.measurements,
                         'vision', c.analysis),
      c.clinician_notes, v_uid
    );
  END IF;

  UPDATE public.mmdp_potential_cases
  SET status = 'registered',
      beneficiary_id = v_beneficiary_id,
      facility_id = _facility_id,
      accepted_at = CASE WHEN _facility_id <> c.facility_id THEN now() ELSE accepted_at END,
      accepted_by = CASE WHEN _facility_id <> c.facility_id THEN v_uid ELSE accepted_by END
  WHERE id = _case_id;

  INSERT INTO public.beneficiary_audit (beneficiary_id, project_id, action, field_name, new_value, actor_id)
  VALUES (v_beneficiary_id, c.project_id, 'registered_from_case_search', 'case_id', v_case_code, v_uid);

  RETURN v_beneficiary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_confirmed_mmdp_case(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.register_confirmed_mmdp_case(uuid, uuid) TO authenticated;

-- Score every case already in the register.
UPDATE public.mmdp_potential_cases SET status = status WHERE cdd_id IS NOT NULL;
