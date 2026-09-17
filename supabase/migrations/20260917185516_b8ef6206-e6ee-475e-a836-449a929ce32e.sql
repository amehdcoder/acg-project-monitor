CREATE OR REPLACE FUNCTION public.auto_place_beneficiary_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_head text;
  v_is_head boolean := false;
  v_address text;
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
    WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.beneficiary_id = NEW.id);
    RETURN NEW;
  END IF;

  v_raw := NULLIF(btrim(COALESCE(NEW.profile->>'household_head', '')), '');
  v_address := NULLIF(btrim(COALESCE(NEW.profile->>'address', '')), '');

  IF v_raw IS NOT NULL AND lower(v_raw) IN ('yes','y','true','1') THEN
    v_is_head := true;
    v_head := NEW.full_name;
  ELSIF v_raw IS NOT NULL AND lower(v_raw) IN ('no','n','false','0') THEN
    v_head := NULL;
  ELSE
    v_head := v_raw;
    v_is_head := v_raw IS NOT NULL AND lower(btrim(v_raw)) = lower(btrim(NEW.full_name));
  END IF;

  IF v_head IS NOT NULL THEN
    SELECT h.id INTO v_household
    FROM public.beneficiary_households h
    WHERE h.project_id = NEW.project_id
      AND COALESCE(lower(btrim(h.village)), '') = COALESCE(lower(btrim(NEW.village)), '')
      AND COALESCE(lower(btrim(h.ward)), '') = COALESCE(lower(btrim(NEW.ward)), '')
      AND lower(btrim(COALESCE(h.head_name, ''))) = lower(btrim(v_head))
    ORDER BY h.created_at
    LIMIT 1;
  END IF;

  IF v_household IS NULL AND v_address IS NOT NULL THEN
    SELECT h.id INTO v_household
    FROM public.beneficiary_households h
    WHERE h.project_id = NEW.project_id
      AND COALESCE(lower(btrim(h.village)), '') = COALESCE(lower(btrim(NEW.village)), '')
      AND COALESCE(lower(btrim(h.ward)), '') = COALESCE(lower(btrim(NEW.ward)), '')
      AND lower(btrim(COALESCE(h.notes, ''))) = lower(v_address)
    ORDER BY h.created_at
    LIMIT 1;
  END IF;

  IF v_household IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(household_code, '\D', '', 'g'), '')::integer), 0) + 1
      INTO v_next
    FROM public.beneficiary_households
    WHERE project_id = NEW.project_id;

    v_code := 'HH-' || lpad(v_next::text, 4, '0');

    INSERT INTO public.beneficiary_households (
      project_id, module_id, household_code, name, head_name, household_size,
      state, lga, ward, village, latitude, longitude, notes, created_by
    ) VALUES (
      NEW.project_id, NEW.module_id, v_code,
      COALESCE(v_head, NEW.full_name) || ' household',
      COALESCE(v_head, NEW.full_name), 1,
      NEW.state, NEW.lga, NEW.ward, NEW.village, NEW.latitude, NEW.longitude,
      v_address, NEW.created_by
    )
    RETURNING id INTO v_household;
  END IF;

  UPDATE public.beneficiaries
     SET household_id = v_household,
         household_role = COALESCE(household_role, CASE WHEN v_is_head THEN 'head' ELSE 'other' END)
   WHERE id = NEW.id;

  INSERT INTO public.household_members (
    project_id, module_id, household_id, beneficiary_id, full_name, relationship, created_by
  )
  SELECT NEW.project_id, NEW.module_id, v_household, NEW.id, NEW.full_name,
         CASE WHEN v_is_head THEN 'head' ELSE COALESCE(NEW.household_role, 'other') END, NEW.created_by
  WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.beneficiary_id = NEW.id);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_place_beneficiary_household() FROM PUBLIC, anon, authenticated;