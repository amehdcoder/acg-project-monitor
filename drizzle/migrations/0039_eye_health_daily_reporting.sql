CREATE TABLE public.eye_report_projects (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.eye_report_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_report boolean NOT NULL DEFAULT false,
  can_view_dashboard boolean NOT NULL DEFAULT false,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE TABLE public.eye_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL,
  facility_name text NOT NULL,
  state text,
  lga text,
  report_date date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  csom jsonb,
  notes text,
  prepared_by text,
  confirmed_by text,
  created_by uuid,
  device_id uuid,
  collector_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX eye_daily_reports_one_per_day ON public.eye_daily_reports (project_id, lower(facility_name), report_date);
CREATE INDEX eye_daily_reports_project_date ON public.eye_daily_reports (project_id, report_date);

CREATE OR REPLACE FUNCTION public.eye_report_enabled(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.eye_report_projects WHERE project_id = _project)
$$;
CREATE OR REPLACE FUNCTION public.can_eye_report(_user uuid, _project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.eye_report_enabled(_project) AND (
    public.is_admin(_user) OR public.is_owner_or_co_owner(_user)
    OR EXISTS (SELECT 1 FROM public.eye_report_access a WHERE a.project_id = _project AND a.user_id = _user AND a.can_report))
$$;
CREATE OR REPLACE FUNCTION public.can_view_eye_dashboard(_user uuid, _project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.eye_report_enabled(_project) AND (
    public.is_admin(_user) OR public.is_owner_or_co_owner(_user)
    OR EXISTS (SELECT 1 FROM public.eye_report_access a WHERE a.project_id = _project AND a.user_id = _user AND a.can_view_dashboard))
$$;
GRANT EXECUTE ON FUNCTION public.eye_report_enabled(uuid), public.can_eye_report(uuid, uuid), public.can_view_eye_dashboard(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eye_daily_reports_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.report_date > (now() AT TIME ZONE 'Africa/Lagos')::date THEN
    RAISE EXCEPTION 'Report date cannot be in the future';
  END IF;
  IF length(trim(NEW.facility_name)) = 0 THEN RAISE EXCEPTION 'Facility is required'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.eye_daily_reports_validate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eye_daily_reports_validate BEFORE INSERT OR UPDATE ON public.eye_daily_reports
FOR EACH ROW EXECUTE FUNCTION public.eye_daily_reports_validate();

GRANT SELECT ON public.eye_report_projects TO authenticated;
GRANT INSERT, DELETE ON public.eye_report_projects TO authenticated;
GRANT ALL ON public.eye_report_projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eye_report_access TO authenticated;
GRANT ALL ON public.eye_report_access TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eye_daily_reports TO authenticated;
GRANT ALL ON public.eye_daily_reports TO service_role;

ALTER TABLE public.eye_report_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eye_report_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eye_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see enabled projects" ON public.eye_report_projects FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Admins add projects" ON public.eye_report_projects FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Admins remove projects" ON public.eye_report_projects FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE POLICY "Own or admin read access" ON public.eye_report_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Admins grant access" ON public.eye_report_access FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Admins update access" ON public.eye_report_access FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Admins revoke access" ON public.eye_report_access FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE POLICY "Reporters and viewers read" ON public.eye_daily_reports FOR SELECT TO authenticated
  USING (public.can_view_eye_dashboard(auth.uid(), project_id) OR (created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id)));
CREATE POLICY "Reporters insert" ON public.eye_daily_reports FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id));
CREATE POLICY "Reporters edit own, admins edit all" ON public.eye_daily_reports FOR UPDATE TO authenticated
  USING ((created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id)) OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.can_eye_report(auth.uid(), project_id) OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Admins delete" ON public.eye_daily_reports FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));