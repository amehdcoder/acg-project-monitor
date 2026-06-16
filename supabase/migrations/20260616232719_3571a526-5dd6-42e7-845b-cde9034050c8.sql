CREATE TABLE public.sbc_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  created_by UUID NOT NULL DEFAULT auth.uid(),
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
  female_count INTEGER DEFAULT 0,
  male_count INTEGER DEFAULT 0,
  age_under18 INTEGER DEFAULT 0,
  age_18_35 INTEGER DEFAULT 0,
  age_35_plus INTEGER DEFAULT 0,
  narrative_progress TEXT,
  contribution_story TEXT,
  key_challenges TEXT,
  actions_next_steps TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  submission_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sbc_reports TO authenticated;
GRANT ALL ON public.sbc_reports TO service_role;

ALTER TABLE public.sbc_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all SBC reports"
  ON public.sbc_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create their own SBC reports"
  ON public.sbc_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own SBC reports"
  ON public.sbc_reports FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own SBC reports"
  ON public.sbc_reports FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER update_sbc_reports_updated_at
  BEFORE UPDATE ON public.sbc_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();