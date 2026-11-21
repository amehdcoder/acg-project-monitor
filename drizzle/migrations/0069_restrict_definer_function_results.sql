REVOKE EXECUTE ON FUNCTION public.ingest_cases(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_cases(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.accessible_project_ids(_user_id uuid)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT project_id), ARRAY[]::uuid[])
  FROM (
    SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = _user_id
    UNION
    SELECT da.project_id FROM public.dashboard_access da WHERE da.user_id = _user_id AND da.project_id IS NOT NULL
    UNION
    SELECT f.project_id FROM public.dashboard_access da
    JOIN public.forms f ON da.project_id IS NULL AND public.is_mda_checklist_form(f.name, f.settings)
    WHERE da.user_id = _user_id AND da.dashboard_id = 'mda_supervisory'
  ) visible
  WHERE project_id IS NOT NULL
    AND (auth.uid() IS NULL OR _user_id = auth.uid() OR public.is_admin(auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.accessible_form_ids(_user_id uuid)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH project_scope AS (SELECT unnest(public.accessible_project_ids(_user_id)) AS project_id)
  SELECT COALESCE(array_agg(DISTINCT form_id), ARRAY[]::uuid[])
  FROM (
    SELECT ufa.form_id FROM public.user_form_assignments ufa WHERE ufa.user_id = _user_id
    UNION
    SELECT sfa.form_id FROM public.sarmaan_form_access sfa WHERE sfa.user_id = _user_id
    UNION
    SELECT f.id FROM public.forms f JOIN project_scope ps ON ps.project_id = f.project_id
    UNION
    SELECT f.id FROM public.forms f
    JOIN public.dashboard_access da ON da.user_id = _user_id AND da.dashboard_id = 'mda_supervisory'
     AND (da.project_id IS NULL OR da.project_id = f.project_id)
    WHERE public.is_mda_checklist_form(f.name, f.settings)
  ) visible
  WHERE form_id IS NOT NULL
    AND (auth.uid() IS NULL OR _user_id = auth.uid() OR public.is_admin(auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.effective_programme_permissions(_uid uuid, _project uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
SELECT CASE WHEN m.permissions->>'access_category' IS NULL THEN m.permissions
 ELSE COALESCE(p.permissions, CASE m.permissions->>'access_category'
 WHEN 'facility_focal' THEN '{"view_records":true,"view_dashboards":true}'::jsonb
 WHEN 'clinician' THEN '{"health_worker":"Clinician","view_records":true,"edit_records":true,"record_services":true,"confirm_cases":true,"accept_referrals":true,"view_dashboards":true}'::jsonb
 WHEN 'pharmacist' THEN '{"health_worker":"Pharmacist","view_records":true,"record_services":true,"accept_referrals":true,"view_dashboards":true}'::jsonb
 WHEN 'records_officer' THEN '{"view_records":true,"edit_records":true,"record_services":true,"home_visits":true,"export_data":true,"view_dashboards":true}'::jsonb
 WHEN 'programme_officer' THEN '{"view_records":true,"view_dashboards":true,"export_data":true}'::jsonb
 WHEN 'team_member' THEN '{"view_records":true,"view_dashboards":true}'::jsonb
 WHEN 'safeguarding_officer' THEN '{"view_safeguarding":true}'::jsonb ELSE m.permissions END)
 || (SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(m.permissions) WHERE key IN ('components','programme_areas','programme_staff','health_worker','dashboards','feedback_share','access_category')) END
FROM public.programme_team_members m LEFT JOIN public.project_access_profiles p
 ON p.project_id=m.project_id AND p.role_key=m.permissions->>'access_category'
WHERE m.project_id=_project AND m.user_id=_uid AND m.is_active
  AND (auth.uid() IS NULL OR _uid = auth.uid() OR public.is_admin(auth.uid()))
ORDER BY m.updated_at DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.user_programme_areas(_uid uuid, _project uuid)
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      AND (auth.uid() IS NULL OR _uid = auth.uid() OR public.is_admin(auth.uid()))
    ORDER BY updated_at DESC LIMIT 1) m ON true
$function$;

CREATE OR REPLACE FUNCTION public.get_project_chat_members(_project_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text, designation text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.user_id,
    COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), 'User') AS full_name,
    NULL::text AS email, p.avatar_url, p.designation::text
  FROM public.user_project_assignments upa
  JOIN public.profiles p ON p.user_id = upa.user_id
  WHERE upa.project_id = _project_id
    AND auth.uid() IS NOT NULL
    AND p.user_id <> auth.uid()
    AND COALESCE(p.is_active, true) = true
    AND (EXISTS (SELECT 1 FROM public.user_project_assignments me WHERE me.project_id = _project_id AND me.user_id = auth.uid())
      OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  ORDER BY full_name;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_project_chat_members(uuid) FROM PUBLIC, anon;