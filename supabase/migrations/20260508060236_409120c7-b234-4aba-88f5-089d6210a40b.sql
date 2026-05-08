
-- =========================================================
-- CES Survey workflow tables
-- =========================================================

CREATE TABLE IF NOT EXISTS public.ces_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  form_id uuid,
  name text NOT NULL,
  survey_date date NOT NULL DEFAULT CURRENT_DATE,
  state text,
  lga text,
  ward text,
  flhf_name text,
  community_name text,
  settlement_name text,
  settlement_id text,
  center_lat double precision,
  center_lng double precision,
  perimeter_coords jsonb DEFAULT '[]'::jsonb,
  est_hh_ai integer,
  est_hh_user integer,
  target_sample_n integer,
  segments_count integer DEFAULT 0,
  selected_segment_ids jsonb DEFAULT '[]'::jsonb,
  inferred_coverage_pct numeric,
  ci_lower_95 numeric,
  ci_upper_95 numeric,
  ci_lower_99 numeric,
  ci_upper_99 numeric,
  design_effect numeric,
  precision_value numeric,
  status text NOT NULL DEFAULT 'draft', -- draft | completed | submitted | locked
  supervisor_qc_by uuid,
  supervisor_qc_at timestamptz,
  device_id text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CES surveys: authenticated read"
  ON public.ces_surveys FOR SELECT TO authenticated USING (true);
CREATE POLICY "CES surveys: creator insert"
  ON public.ces_surveys FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "CES surveys: creator or admin update"
  ON public.ces_surveys FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "CES surveys: creator or admin delete"
  ON public.ces_surveys FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE TRIGGER ces_surveys_set_updated_at
  BEFORE UPDATE ON public.ces_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ces_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL,
  label text NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  centroid_lat double precision,
  centroid_lng double precision,
  color text,
  est_hh integer DEFAULT 0,
  sampled_hh integer DEFAULT 0,
  treated_hh integer DEFAULT 0,
  coverage_pct numeric,
  weight numeric,
  is_selected boolean DEFAULT false,
  segment_status text DEFAULT 'not_started', -- not_started | partial | completed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CES segments: authenticated read"
  ON public.ces_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "CES segments: insert via owned survey"
  ON public.ces_segments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "CES segments: update via owned survey"
  ON public.ces_segments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "CES segments: delete via owned survey"
  ON public.ces_segments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))));

CREATE TRIGGER ces_segments_set_updated_at
  BEFORE UPDATE ON public.ces_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS ces_segments_survey_idx ON public.ces_segments(survey_id);

-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ces_household_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL,
  segment_id uuid,
  hh_number text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  gps_accuracy double precision,
  coverage_status text NOT NULL DEFAULT 'unassessed', -- treated | not_treated | absent | refused | ineligible | unassessed
  commodity text,
  notes text,
  photo_url text,
  device_id text,
  interviewer_name text,
  visited_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_household_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CES visits: authenticated read"
  ON public.ces_household_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "CES visits: creator insert"
  ON public.ces_household_visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "CES visits: creator or admin update"
  ON public.ces_household_visits FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "CES visits: creator or admin delete"
  ON public.ces_household_visits FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS ces_visits_survey_idx ON public.ces_household_visits(survey_id);
CREATE INDEX IF NOT EXISTS ces_visits_segment_idx ON public.ces_household_visits(segment_id);

-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ces_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CES audit: actor insert"
  ON public.ces_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "CES audit: admin or survey creator can view"
  ON public.ces_audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND s.created_by = auth.uid()));

CREATE INDEX IF NOT EXISTS ces_audit_survey_idx ON public.ces_audit_log(survey_id);

-- enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_surveys;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_household_visits;
