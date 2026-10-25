CREATE OR REPLACE FUNCTION public.effective_programme_permissions(_uid uuid, _project uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
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
WHERE m.project_id=_project AND m.user_id=_uid AND m.is_active ORDER BY m.updated_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.effective_programme_permissions(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_programme_permissions(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.programme_action_allowed(_uid uuid,_project uuid,_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_admin(_uid) OR COALESCE((public.effective_programme_permissions(_uid,_project)->>_action)::boolean,
 NOT EXISTS(SELECT 1 FROM public.programme_team_members WHERE user_id=_uid AND project_id=_project AND is_active));
$$;
REVOKE ALL ON FUNCTION public.programme_action_allowed(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.programme_action_allowed(uuid,uuid,text) TO authenticated,service_role;
CREATE POLICY category_beneficiary_insert ON public.beneficiaries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'edit_records'));
CREATE POLICY category_beneficiary_update ON public.beneficiaries AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.programme_action_allowed(auth.uid(),project_id,'edit_records')) WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'edit_records'));
CREATE POLICY category_assessment_insert ON public.livelihood_assessments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'assess_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood'));
CREATE POLICY category_assessment_update ON public.livelihood_assessments AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.programme_action_allowed(auth.uid(),project_id,'assess_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood')) WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'assess_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood'));
CREATE POLICY category_verification_insert ON public.livelihood_verifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'verify_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood'));
CREATE POLICY category_verification_update ON public.livelihood_verifications AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.programme_action_allowed(auth.uid(),project_id,'verify_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood')) WITH CHECK (public.programme_action_allowed(auth.uid(),project_id,'verify_livelihood') OR public.programme_action_allowed(auth.uid(),project_id,'manage_livelihood'));
CREATE OR REPLACE FUNCTION public.save_graduation_gate(_beneficiary uuid,_gate jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.beneficiaries; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to save a Graduation decision'; END IF;
 SELECT * INTO b FROM public.beneficiaries WHERE id=_beneficiary FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Beneficiary not found'; END IF;
 IF NOT (public.is_admin(uid) OR (public.is_project_member(uid,b.project_id) AND NOT public.facility_restricted_user(uid)
 AND public.beneficiary_in_user_scope(uid,b.id,b.project_id,b.created_by)
 AND (public.programme_action_allowed(uid,b.project_id,'assess_livelihood') OR public.programme_action_allowed(uid,b.project_id,'verify_livelihood') OR public.programme_action_allowed(uid,b.project_id,'manage_livelihood')))) THEN RAISE EXCEPTION 'You do not have permission to update this Graduation pathway'; END IF;
 IF _gate->>'status' NOT IN ('mapped','verified','selected','not_selected') OR _gate->>'status' IS NULL THEN RAISE EXCEPTION 'Invalid Graduation status'; END IF;
 UPDATE public.beneficiaries SET profile=COALESCE(profile,'{}'::jsonb) || jsonb_build_object('graduation',_gate || jsonb_build_object('updated_by',uid)),updated_at=now() WHERE id=b.id;
 RETURN b.id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_graduation_gate(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_graduation_gate(uuid,jsonb) TO authenticated,service_role;