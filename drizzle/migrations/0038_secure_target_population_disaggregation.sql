CREATE OR REPLACE FUNCTION public.guard_microplan_target_population_setting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selection jsonb; mode text;
BEGIN
 IF (TG_OP <> 'INSERT' AND OLD.setting_key = 'target_pop_fields') OR (TG_OP <> 'DELETE' AND NEW.setting_key = 'target_pop_fields') THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
   RAISE EXCEPTION 'Only Super Admins may configure Target Population' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.setting_key = 'target_pop_fields' THEN
   selection := NEW.value;
   IF jsonb_typeof(selection) <> 'array' OR jsonb_array_length(selection) = 0 THEN RAISE EXCEPTION 'Select at least one population age group'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(selection) AS x(v) WHERE v NOT IN ('total_population','children_0_4','children_5_14','adults_15_plus','trachoma_0_5m','trachoma_6m_6y','trachoma_7_14y','trachoma_15_plus')) THEN RAISE EXCEPTION 'Invalid population age group'; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements_text(selection)) <> (SELECT count(DISTINCT v) FROM jsonb_array_elements_text(selection) AS x(v)) THEN RAISE EXCEPTION 'Duplicate population age group'; END IF;
   IF selection ? 'total_population' AND jsonb_array_length(selection) <> 1 THEN RAISE EXCEPTION 'Whole community cannot be combined with age groups'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(selection) AS x(v) WHERE v LIKE 'trachoma_%') AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(selection) AS x(v) WHERE v IN ('children_0_4','children_5_14','adults_15_plus')) THEN RAISE EXCEPTION 'Standard and Trachoma age groups cannot be combined'; END IF;
  END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_microplan_target_population_setting() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_microplan_target_population_setting BEFORE INSERT OR UPDATE OR DELETE ON public.microplan_project_settings FOR EACH ROW EXECUTE FUNCTION public.guard_microplan_target_population_setting();