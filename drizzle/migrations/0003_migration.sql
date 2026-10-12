
CREATE OR REPLACE FUNCTION public.programme_area_matches(_component text, _areas text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(_areas) a WHERE
    (a = 'ntd' AND _component ~* '(mmdp|ntd|morbidity|lymph|hydro|trachom|trichiasis|oncho|schisto|filaria|lesion)') OR
    (a = 'eye' AND _component ~* '(eye|ophthal|vision|cataract|trachom|trichiasis|optom)') OR
    (a = 'mental' AND _component ~* '(mental|psycho|mhpss|mhgap|depress)') OR
    (a = 'wash' AND _component ~* '(wash|water|sanitation|hygiene)') OR
    (a = 'livelihood' AND _component ~* '(livelihood|economic|empower|income|vocation)') OR
    (a = 'health' AND _component !~* '(livelihood|economic|empower|income|vocation)'))
$$;

-- Programme-area scope for a user in a project. NULL = unrestricted.
CREATE OR REPLACE FUNCTION public.user_programme_areas(_uid uuid, _project uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_admin(_uid) THEN NULL
    WHEN COALESCE(m.permissions->>'health_worker','') <> '' THEN ARRAY['health']
    WHEN COALESCE(m.permissions->>'programme_staff','') <> ''
         AND jsonb_typeof(m.permissions->'programme_areas') = 'array'
         AND jsonb_array_length(m.permissions->'programme_areas') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(m.permissions->'programme_areas'))
    ELSE NULL END
  FROM (SELECT 1) x
  LEFT JOIN LATERAL (
    SELECT permissions FROM public.programme_team_members
    WHERE user_id = _uid AND project_id = _project AND is_active
    ORDER BY updated_at DESC LIMIT 1) m ON true
$$;

CREATE OR REPLACE FUNCTION public.beneficiary_in_user_scope(_uid uuid, _beneficiary uuid, _project uuid, _created_by uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _areas text[];
BEGIN
  _areas := public.user_programme_areas(_uid, _project);
  IF _areas IS NULL OR _created_by = _uid THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.beneficiary_services s
    WHERE s.beneficiary_id = _beneficiary AND public.programme_area_matches(s.component_key, _areas));
END $$;

CREATE OR REPLACE FUNCTION public.service_in_user_scope(_uid uuid, _project uuid, _component text, _recorded_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN a IS NULL OR _recorded_by = _uid THEN true ELSE public.programme_area_matches(_component, a) END
  FROM (SELECT public.user_programme_areas(_uid, _project) a) x
$$;

REVOKE ALL ON FUNCTION public.user_programme_areas(uuid,uuid), public.beneficiary_in_user_scope(uuid,uuid,uuid,uuid), public.service_in_user_scope(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_programme_areas(uuid,uuid), public.beneficiary_in_user_scope(uuid,uuid,uuid,uuid), public.service_in_user_scope(uuid,uuid,text,uuid), public.programme_area_matches(text,text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "Project members view beneficiaries" ON public.beneficiaries;
CREATE POLICY "Project members view beneficiaries" ON public.beneficiaries FOR SELECT TO authenticated
USING (is_admin((SELECT auth.uid())) OR (project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
  AND public.beneficiary_in_user_scope((SELECT auth.uid()), id, project_id, created_by)));

DROP POLICY IF EXISTS "Facility focal persons view beneficiaries" ON public.beneficiaries;
CREATE POLICY "Facility focal persons view beneficiaries" ON public.beneficiaries FOR SELECT TO authenticated
USING (has_facility_access_to_beneficiary((SELECT auth.uid()), id)
  AND public.beneficiary_in_user_scope((SELECT auth.uid()), id, project_id, created_by));

DROP POLICY IF EXISTS "Project members view services" ON public.beneficiary_services;
CREATE POLICY "Project members view services" ON public.beneficiary_services FOR SELECT TO authenticated
USING (is_admin((SELECT auth.uid())) OR (project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
  AND public.service_in_user_scope((SELECT auth.uid()), project_id, component_key, recorded_by)));

DROP POLICY IF EXISTS "Facility focal persons view services" ON public.beneficiary_services;
CREATE POLICY "Facility focal persons view services" ON public.beneficiary_services FOR SELECT TO authenticated
USING (has_facility_access_to_beneficiary((SELECT auth.uid()), beneficiary_id)
  AND public.service_in_user_scope((SELECT auth.uid()), project_id, component_key, recorded_by));

DROP POLICY IF EXISTS "Project members create services" ON public.beneficiary_services;
CREATE POLICY "Project members create services" ON public.beneficiary_services FOR INSERT TO authenticated
WITH CHECK (recorded_by = (SELECT auth.uid()) AND (is_admin((SELECT auth.uid())) OR (project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
  AND (public.user_programme_areas((SELECT auth.uid()), project_id) IS NULL OR public.programme_area_matches(component_key, public.user_programme_areas((SELECT auth.uid()), project_id))))));

ALTER TABLE public.health_exchange_connections ADD COLUMN IF NOT EXISTS programme_area text;
