CREATE TABLE public.irf_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  -- Reporting identity
  reporting_period text,
  reporting_month date,
  state text,
  lga text,
  ward text,
  focal_person_name text,
  focal_person_phone text,
  gps_lat double precision,
  gps_lng double precision,
  -- 1. Advocacy to Stakeholders
  mdas_visited_count integer DEFAULT 0,
  mdas_names text,
  state_advocacy_meetings integer DEFAULT 0,
  state_advocacy_outcomes text,
  emirate_council_meetings integer DEFAULT 0,
  emirate_council_support text,
  -- 2. LGA Level Advocacy
  policy_makers_engaged integer DEFAULT 0,
  policy_makers_names text,
  traditional_leaders_engaged integer DEFAULT 0,
  traditional_leaders_support text,
  healthcare_workers_engaged integer DEFAULT 0,
  healthcare_facility_type text,
  religious_leaders_engaged integer DEFAULT 0,
  religious_leaders_support_mode text,
  -- 3. Social Mobilization & Awareness Creation
  community_dialogue_sessions integer DEFAULT 0,
  community_dialogue_location text,
  attendance_men integer DEFAULT 0,
  attendance_women integer DEFAULT 0,
  participation_level text,
  questions_asked integer DEFAULT 0,
  issues_raised text,
  issues_resolved text,
  -- 4. Non-Compliance Resolution
  noncompliance_cases integer DEFAULT 0,
  noncompliance_type text,
  noncompliance_area text,
  noncompliance_household_id text,
  cases_resolved integer DEFAULT 0,
  cases_pending integer DEFAULT 0,
  resolution_method text,
  followup_date date,
  -- 5. Awareness Creation
  radio_messages_aired integer DEFAULT 0,
  radio_estimated_reach integer DEFAULT 0,
  town_announcements integer DEFAULT 0,
  mosque_announcements integer DEFAULT 0,
  total_reach integer DEFAULT 0,
  iec_materials_distributed integer DEFAULT 0,
  iec_visibility boolean,
  iec_locations text,
  -- MOV / evidence
  evidence jsonb DEFAULT '[]'::jsonb,
  narrative text,
  submission_status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.irf_reports TO authenticated;
GRANT ALL ON public.irf_reports TO service_role;

ALTER TABLE public.irf_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator, project members or admins view IRF reports"
  ON public.irf_reports FOR SELECT
  USING ((auth.uid() = created_by) OR is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id));

CREATE POLICY "Users can insert their own IRF reports"
  ON public.irf_reports FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own IRF reports"
  ON public.irf_reports FOR UPDATE
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own IRF reports"
  ON public.irf_reports FOR DELETE
  USING (auth.uid() = created_by);

-- Indexes for scale: dashboard aggregation + keyset pagination
CREATE INDEX idx_irf_reports_project_created ON public.irf_reports (project_id, created_at DESC);
CREATE INDEX idx_irf_reports_project_id_keyset ON public.irf_reports (project_id, id);
CREATE INDEX idx_irf_reports_state_lga ON public.irf_reports (project_id, state, lga);
CREATE INDEX idx_irf_reports_month ON public.irf_reports (project_id, reporting_month);

-- updated_at trigger
CREATE TRIGGER update_irf_reports_updated_at
  BEFORE UPDATE ON public.irf_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime for instant dashboard updates
ALTER TABLE public.irf_reports REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.irf_reports;