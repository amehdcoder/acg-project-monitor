CREATE TABLE public.mmdp_cdds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  facility_id uuid NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cdd_code text,
  sex text,
  phone text,
  state text,
  lga text,
  ward text,
  community text,
  trained_on date,
  training_status text NOT NULL DEFAULT 'trained',
  supervisor_name text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mmdp_cdds TO authenticated;
GRANT ALL ON public.mmdp_cdds TO service_role;
ALTER TABLE public.mmdp_cdds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdds readable by admins and facility teams"
ON public.mmdp_cdds FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.facility_access_level_for(auth.uid(), facility_id) IS NOT NULL
);

CREATE POLICY "cdds insertable by admins and facility recorders"
ON public.mmdp_cdds FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
);

CREATE POLICY "cdds updatable by admins and facility recorders"
ON public.mmdp_cdds FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
);

CREATE POLICY "cdds deletable by admins and facility managers"
ON public.mmdp_cdds FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.can_manage_at_facility(auth.uid(), facility_id)
);

CREATE TRIGGER update_mmdp_cdds_updated_at
BEFORE UPDATE ON public.mmdp_cdds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mmdp_cdds_facility ON public.mmdp_cdds(facility_id);
CREATE INDEX idx_mmdp_cdds_project ON public.mmdp_cdds(project_id);

CREATE TABLE public.mmdp_potential_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  facility_id uuid NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  cdd_id uuid REFERENCES public.mmdp_cdds(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  sex text,
  age integer,
  phone text,
  state text,
  lga text,
  ward text,
  community text,
  address text,
  latitude double precision,
  longitude double precision,
  condition text NOT NULL DEFAULT 'lymphoedema',
  affected_side text,
  duration_years numeric,
  acute_attacks_last_year integer,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by uuid,
  confirmed_at timestamptz,
  confirmed_condition text,
  confirmed_stage integer,
  confirmed_stage_label text,
  clinical_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  clinician_notes text,
  rejection_reason text,
  referred_to_facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL,
  referred_at timestamptz,
  referral_urgency text,
  referral_summary text,
  accepted_at timestamptz,
  accepted_by uuid,
  beneficiary_id uuid REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
  submission_uuid uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mmdp_potential_cases TO authenticated;
GRANT ALL ON public.mmdp_potential_cases TO service_role;
ALTER TABLE public.mmdp_potential_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "potential cases readable by admins, owning and receiving facilities"
ON public.mmdp_potential_cases FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.facility_access_level_for(auth.uid(), facility_id) IS NOT NULL
  OR (referred_to_facility_id IS NOT NULL
      AND public.facility_access_level_for(auth.uid(), referred_to_facility_id) IS NOT NULL)
);

CREATE POLICY "potential cases insertable by admins and facility recorders"
ON public.mmdp_potential_cases FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
);

CREATE POLICY "potential cases updatable by admins, owning and receiving facilities"
ON public.mmdp_potential_cases FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
  OR (referred_to_facility_id IS NOT NULL
      AND public.can_record_at_facility(auth.uid(), referred_to_facility_id))
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.can_record_at_facility(auth.uid(), facility_id)
  OR (referred_to_facility_id IS NOT NULL
      AND public.can_record_at_facility(auth.uid(), referred_to_facility_id))
);

CREATE POLICY "potential cases deletable by admins and facility managers"
ON public.mmdp_potential_cases FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.can_manage_at_facility(auth.uid(), facility_id)
);

CREATE TRIGGER update_mmdp_potential_cases_updated_at
BEFORE UPDATE ON public.mmdp_potential_cases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mmdp_cases_facility ON public.mmdp_potential_cases(facility_id);
CREATE INDEX idx_mmdp_cases_referred ON public.mmdp_potential_cases(referred_to_facility_id);
CREATE INDEX idx_mmdp_cases_cdd ON public.mmdp_potential_cases(cdd_id);
CREATE INDEX idx_mmdp_cases_project_status ON public.mmdp_potential_cases(project_id, status);
CREATE UNIQUE INDEX idx_mmdp_cases_submission_uuid
  ON public.mmdp_potential_cases(submission_uuid) WHERE submission_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_confirmed_mmdp_case(
  _case_id uuid,
  _facility_id uuid
)
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
    status, photo_url, latitude, longitude, state, lga, ward, village, created_by
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
    v_uid
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