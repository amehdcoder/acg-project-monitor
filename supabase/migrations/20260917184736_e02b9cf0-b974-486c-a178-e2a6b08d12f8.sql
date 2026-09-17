-- 1. Household roster ------------------------------------------------------
CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  household_id uuid NOT NULL REFERENCES public.beneficiary_households(id) ON DELETE CASCADE,
  beneficiary_id uuid REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  sex text,
  date_of_birth date,
  age_years numeric,
  relationship text DEFAULT 'other',
  height_cm numeric,
  is_pregnant boolean NOT NULL DEFAULT false,
  is_breastfeeding boolean NOT NULL DEFAULT false,
  is_alive boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX household_members_beneficiary_key
  ON public.household_members(beneficiary_id) WHERE beneficiary_id IS NOT NULL;
CREATE INDEX household_members_household_idx ON public.household_members(household_id);
CREATE INDEX household_members_project_idx ON public.household_members(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read household roster"
  ON public.household_members FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members add household roster"
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members update household roster"
  ON public.household_members FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Admins delete household roster"
  ON public.household_members FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER household_members_updated_at
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Treatment entries can belong to a roster member -------------------------
ALTER TABLE public.household_mda_treatments
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.household_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS household_mda_treatments_member_idx
  ON public.household_mda_treatments(member_id);

-- 3. NTD morbidity register --------------------------------------------------
CREATE TABLE public.ntd_morbidity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  household_id uuid REFERENCES public.beneficiary_households(id) ON DELETE SET NULL,
  beneficiary_id uuid REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.household_members(id) ON DELETE CASCADE,
  condition text NOT NULL,
  stage text,
  affected_side text,
  limb_circumference_cm numeric,
  acute_attacks_last_year integer,
  self_care_kit_issued boolean NOT NULL DEFAULT false,
  self_care_trained boolean NOT NULL DEFAULT false,
  surgery_status text,
  surgery_date date,
  next_review_date date,
  notes text,
  recorded_on date NOT NULL DEFAULT current_date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ntd_morbidity_project_idx ON public.ntd_morbidity_records(project_id);
CREATE INDEX ntd_morbidity_beneficiary_idx ON public.ntd_morbidity_records(beneficiary_id);
CREATE INDEX ntd_morbidity_member_idx ON public.ntd_morbidity_records(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ntd_morbidity_records TO authenticated;
GRANT ALL ON public.ntd_morbidity_records TO service_role;
ALTER TABLE public.ntd_morbidity_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read morbidity records"
  ON public.ntd_morbidity_records FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members add morbidity records"
  ON public.ntd_morbidity_records FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members update morbidity records"
  ON public.ntd_morbidity_records FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Admins delete morbidity records"
  ON public.ntd_morbidity_records FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER ntd_morbidity_updated_at
  BEFORE UPDATE ON public.ntd_morbidity_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Automatic household placement ------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_place_beneficiary_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_head text;
  v_household uuid;
  v_next integer;
  v_code text;
BEGIN
  IF NEW.household_id IS NOT NULL THEN
    INSERT INTO public.household_members (
      project_id, module_id, household_id, beneficiary_id, full_name, relationship, created_by
    )
    SELECT NEW.project_id, NEW.module_id, NEW.household_id, NEW.id, NEW.full_name,
           COALESCE(NEW.household_role, 'other'), NEW.created_by
    WHERE NOT EXISTS (
      SELECT 1 FROM public.household_members m WHERE m.beneficiary_id = NEW.id
    );
    RETURN NEW;
  END IF;

  v_head := NULLIF(btrim(COALESCE(NEW.profile->>'household_head', '')), '');

  SELECT h.id INTO v_household
  FROM public.beneficiary_households h
  WHERE h.project_id = NEW.project_id
    AND COALESCE(lower(btrim(h.village)), '') = COALESCE(lower(btrim(NEW.village)), '')
    AND COALESCE(lower(btrim(h.ward)), '') = COALESCE(lower(btrim(NEW.ward)), '')
    AND v_head IS NOT NULL
    AND lower(btrim(COALESCE(h.head_name, ''))) = lower(v_head)
  ORDER BY h.created_at
  LIMIT 1;

  IF v_household IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(household_code, '\D', '', 'g'), '')::integer), 0) + 1
      INTO v_next
    FROM public.beneficiary_households
    WHERE project_id = NEW.project_id;

    v_code := 'HH-' || lpad(v_next::text, 4, '0');

    INSERT INTO public.beneficiary_households (
      project_id, module_id, household_code, name, head_name, household_size,
      state, lga, ward, village, latitude, longitude, created_by
    ) VALUES (
      NEW.project_id, NEW.module_id, v_code,
      COALESCE(v_head, NEW.full_name) || ' household',
      COALESCE(v_head, NEW.full_name), 1,
      NEW.state, NEW.lga, NEW.ward, NEW.village, NEW.latitude, NEW.longitude, NEW.created_by
    )
    RETURNING id INTO v_household;
  END IF;

  UPDATE public.beneficiaries
     SET household_id = v_household,
         household_role = COALESCE(household_role,
           CASE WHEN v_head IS NOT NULL
                 AND lower(btrim(v_head)) = lower(btrim(NEW.full_name))
                THEN 'head' ELSE 'other' END)
   WHERE id = NEW.id;

  INSERT INTO public.household_members (
    project_id, module_id, household_id, beneficiary_id, full_name, relationship, created_by
  )
  SELECT NEW.project_id, NEW.module_id, v_household, NEW.id, NEW.full_name,
         COALESCE(NEW.household_role, 'other'), NEW.created_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.household_members m WHERE m.beneficiary_id = NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER beneficiaries_auto_household
  AFTER INSERT ON public.beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.auto_place_beneficiary_household();

-- 5. Backfill existing records ----------------------------------------------
INSERT INTO public.household_members (
  project_id, module_id, household_id, beneficiary_id, full_name, relationship, created_by
)
SELECT b.project_id, b.module_id, b.household_id, b.id, b.full_name,
       COALESCE(b.household_role, 'other'), b.created_by
FROM public.beneficiaries b
WHERE b.household_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.beneficiary_id = b.id);
