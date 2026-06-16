CREATE TABLE public.acsm_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  created_by UUID,
  reporting_period TEXT,
  reporting_level TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  community TEXT,
  category TEXT,
  indicator TEXT,
  indicator_level TEXT,
  unit_of_measure TEXT,
  target_value NUMERIC,
  actual_achieved NUMERIC,
  achievement_pct NUMERIC,
  status TEXT,
  responsible_officer TEXT,
  data_source TEXT,
  date_reported DATE,
  stakeholder_type TEXT,
  engagement_type TEXT,
  communication_channel TEXT,
  reach_type TEXT,
  female_count INTEGER,
  male_count INTEGER,
  age_under18 INTEGER,
  age_18_35 INTEGER,
  age_35_plus INTEGER,
  narrative_progress TEXT,
  contribution_story TEXT,
  key_challenges TEXT,
  actions_next_steps TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  submission_status TEXT NOT NULL DEFAULT 'finalized',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acsm_reports TO authenticated;
GRANT ALL ON public.acsm_reports TO service_role;

ALTER TABLE public.acsm_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ACSM reports"
  ON public.acsm_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own ACSM reports"
  ON public.acsm_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own ACSM reports"
  ON public.acsm_reports FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own ACSM reports"
  ON public.acsm_reports FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER update_acsm_reports_updated_at
  BEFORE UPDATE ON public.acsm_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();