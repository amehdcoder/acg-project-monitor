CREATE TABLE public.microplan_project_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('collector', 'dashboard')),
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT ON public.microplan_project_roles TO authenticated;
GRANT ALL ON public.microplan_project_roles TO service_role;
ALTER TABLE public.microplan_project_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX microplan_project_roles_user_idx ON public.microplan_project_roles(user_id, project_id);

CREATE FUNCTION public.can_manage_microplan_access(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner_or_co_owner(_uid)
    OR public.has_role(_uid, 'super_admin'::public.app_role)
    OR (public.is_admin(_uid) AND EXISTS (SELECT 1 FROM public.admin_page_access WHERE user_id = _uid AND page_id = 'microplanning'));
$$;
REVOKE ALL ON FUNCTION public.can_manage_microplan_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_microplan_access(uuid) TO authenticated, service_role;
CREATE POLICY microplan_roles_read ON public.microplan_project_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_microplan_access(auth.uid()));

CREATE FUNCTION public.microplan_project_access_level(_uid uuid, _project uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_owner_or_co_owner(_uid) THEN 'dashboard'
    WHEN public.has_active_mda_lens(_uid) AND NOT public.is_admin(_uid) THEN
      CASE WHEN public.mda_lens_allows_project(_uid, _project) THEN 'dashboard' ELSE 'none' END
    WHEN public.is_admin(_uid) AND EXISTS (SELECT 1 FROM public.admin_page_access WHERE user_id = _uid AND page_id = 'microplanning') THEN 'dashboard'
    WHEN EXISTS (SELECT 1 FROM public.microplan_form_access WHERE user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.user_page_access WHERE user_id = _uid AND page_id = 'microplanning'
        AND (starts_at IS NULL OR starts_at <= now()) AND (expires_at IS NULL OR expires_at > now()))
      THEN CASE WHEN public.is_admin(_uid) OR public.is_project_member(_uid, _project) THEN 'dashboard'
        ELSE COALESCE((SELECT CASE role WHEN 'dashboard' THEN 'dashboard' ELSE 'entry' END FROM public.microplan_project_roles WHERE user_id = _uid AND project_id = _project), 'none') END
    WHEN EXISTS (SELECT 1 FROM public.microplan_project_roles WHERE user_id = _uid AND project_id = _project AND role = 'dashboard') THEN 'dashboard'
    WHEN EXISTS (SELECT 1 FROM public.microplan_project_roles WHERE user_id = _uid AND project_id = _project AND role = 'collector') THEN 'entry'
    WHEN public.is_project_member(_uid, _project)
      AND EXISTS (SELECT 1 FROM public.microplan_project_grants WHERE project_id = _project)
      AND NOT EXISTS (SELECT 1 FROM public.microplan_project_exclusions WHERE user_id = _uid AND project_id = _project) THEN 'entry'
    WHEN public.has_field_designation(_uid) AND public.is_project_member(_uid, _project) THEN 'entry'
    ELSE 'none' END;
$$;
REVOKE ALL ON FUNCTION public.microplan_project_access_level(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.microplan_project_access_level(uuid,uuid) TO authenticated, service_role;

CREATE FUNCTION public.get_my_microplan_project_access()
RETURNS TABLE(project_id uuid, project_name text, access_level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name::text, a.level
  FROM public.projects p
  CROSS JOIN LATERAL (SELECT public.microplan_project_access_level(auth.uid(),p.id) AS level) a
  WHERE auth.uid() IS NOT NULL AND a.level <> 'none' ORDER BY p.name;
$$;
REVOKE ALL ON FUNCTION public.get_my_microplan_project_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_microplan_project_access() TO authenticated, service_role;

CREATE FUNCTION public.list_microplan_project_members(_project_id uuid)
RETURNS TABLE(user_id uuid, first_name text, last_name text, email text, designation text, is_member boolean, assigned_role text, effective_access text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_microplan_access(auth.uid()) THEN RAISE EXCEPTION 'Only authorized administrators can manage microplanning access' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.user_id, p.first_name::text, p.last_name::text, p.email::text, p.designation::text,
    public.is_project_member(p.user_id,_project_id), r.role,
    public.microplan_project_access_level(p.user_id,_project_id)
  FROM public.profiles p LEFT JOIN public.microplan_project_roles r ON r.user_id=p.user_id AND r.project_id=_project_id
  WHERE r.id IS NOT NULL OR public.is_project_member(p.user_id,_project_id)
  ORDER BY p.first_name, p.last_name;
END; $$;
REVOKE ALL ON FUNCTION public.list_microplan_project_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_microplan_project_members(uuid) TO authenticated, service_role;

CREATE FUNCTION public.set_microplan_project_role(_project_id uuid, _user_id uuid, _role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_microplan_access(auth.uid()) THEN RAISE EXCEPTION 'Only authorized administrators can manage microplanning access' USING ERRCODE='42501'; END IF;
  IF NOT public.mda_lens_write_allowed(auth.uid()) THEN RAISE EXCEPTION 'View-only access cannot change permissions' USING ERRCODE='42501'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('collector','dashboard') THEN RAISE EXCEPTION 'Invalid microplanning role' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id=_project_id) THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _role IS NULL THEN
    DELETE FROM public.microplan_project_roles WHERE project_id=_project_id AND user_id=_user_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id=_user_id AND is_active=true AND approval_status='approved') THEN RAISE EXCEPTION 'Choose an active approved account'; END IF;
    INSERT INTO public.microplan_project_roles(project_id,user_id,role,granted_by)
    VALUES(_project_id,_user_id,_role,auth.uid())
    ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by,updated_at=now();
  END IF;
  RETURN public.microplan_project_access_level(_user_id,_project_id);
END; $$;
REVOKE ALL ON FUNCTION public.set_microplan_project_role(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_microplan_project_role(uuid,uuid,text) TO authenticated, service_role;

CREATE POLICY microplan_role_project_read ON public.projects FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.microplan_project_roles WHERE user_id=auth.uid() AND project_id=projects.id)
  AND (NOT public.has_active_mda_lens(auth.uid()) OR public.is_admin(auth.uid()) OR public.mda_lens_allows_project(auth.uid(),id)));

CREATE FUNCTION public.microplan_row_role_allowed(_uid uuid, _project uuid, _creator uuid, _state text, _lga text, _ward text, _flhf text, _community text, _settlement text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner_or_co_owner(_uid) OR public.is_admin(_uid)
    OR (public.has_active_mda_lens(_uid) AND public.mda_lens_allows_project(_uid,_project))
    OR (public.microplan_project_access_level(_uid,_project) <> 'none'
      AND (public.microplan_project_access_level(_uid,_project)='dashboard' OR _creator=_uid)
      AND (NOT EXISTS(SELECT 1 FROM public.microplan_designation_assignments WHERE user_id=_uid)
        OR public.user_has_microplan_scope(_uid,_state,_lga,_ward,_flhf,_community,_settlement)));
$$;
REVOKE ALL ON FUNCTION public.microplan_row_role_allowed(uuid,uuid,uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.microplan_row_role_allowed(uuid,uuid,uuid,text,text,text,text,text,text) TO authenticated, service_role;
CREATE POLICY microplan_roles_read_entries ON public.microplan_entries FOR SELECT TO authenticated
USING (public.microplan_row_role_allowed(auth.uid(),project_id,created_by,state,lga,ward,flhf_name,community_name,settlement_name));
CREATE POLICY microplan_roles_entry_read_guard ON public.microplan_entries AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.microplan_row_role_allowed(auth.uid(),project_id,created_by,state,lga,ward,flhf_name,community_name,settlement_name));
CREATE POLICY microplan_roles_insert_entries ON public.microplan_entries FOR INSERT TO authenticated
WITH CHECK (created_by=auth.uid() AND public.microplan_project_access_level(auth.uid(),project_id)<>'none');
CREATE POLICY microplan_roles_update_own_entries ON public.microplan_entries FOR UPDATE TO authenticated
USING (created_by=auth.uid() AND public.microplan_project_access_level(auth.uid(),project_id)<>'none')
WITH CHECK (created_by=auth.uid() AND public.microplan_project_access_level(auth.uid(),project_id)<>'none');
CREATE POLICY microplan_roles_entry_write_guard ON public.microplan_entries AS RESTRICTIVE FOR ALL TO authenticated
USING (public.microplan_row_role_allowed(auth.uid(),project_id,created_by,state,lga,ward,flhf_name,community_name,settlement_name))
WITH CHECK (public.microplan_row_role_allowed(auth.uid(),project_id,created_by,state,lga,ward,flhf_name,community_name,settlement_name)
  AND (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id
    AND (COALESCE(cardinality(p.scope_states),0)=0 OR state=ANY(p.scope_states))
    AND (COALESCE(cardinality(p.scope_lgas),0)=0 OR lga=ANY(p.scope_lgas))
    AND (COALESCE(cardinality(p.scope_wards),0)=0 OR ward=ANY(p.scope_wards)))));

CREATE POLICY microplan_roles_read_allocations ON public.microplan_medicine_allocations FOR SELECT TO authenticated
USING (public.microplan_project_access_level(auth.uid(),project_id)='dashboard');
CREATE POLICY microplan_roles_read_coverage ON public.microplan_coverage FOR SELECT TO authenticated
USING (public.microplan_project_access_level(auth.uid(),project_id)='dashboard');
CREATE POLICY microplan_roles_read_reconciliation ON public.microplan_reconciliation FOR SELECT TO authenticated
USING (public.microplan_project_access_level(auth.uid(),project_id)='dashboard');
CREATE POLICY microplan_roles_read_gaps ON public.microplan_missing_communities FOR SELECT TO authenticated
USING (public.microplan_project_access_level(auth.uid(),project_id)='dashboard');