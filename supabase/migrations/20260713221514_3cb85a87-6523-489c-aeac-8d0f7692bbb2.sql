CREATE TABLE public.bmz_monitoring (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  monitor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_visit date,
  state text,
  lga text,
  community_ward text,
  state_supervisor text,
  cadre text,
  sex text,
  trained_eye_care boolean,
  last_training_date date,
  refresher_status text,
  primary_activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_activity_other text,
  linked_facility text,
  screening_kits text,
  eye_poster text,
  register_updated boolean,
  register_reason text,
  referrals_evidence boolean,
  num_referrals integer,
  no_referrals boolean,
  total_screened integer,
  gatherings_count integer,
  challenges jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  supervisor_comments text,
  action_points text,
  respondent_name text,
  respondent_sig_date date,
  supervisor_name text,
  supervisor_sig_date date,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy double precision,
  compliance_score numeric,
  readiness_band text,
  status text NOT NULL DEFAULT 'draft',
  submission_uuid uuid,
  client_submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bmz_monitoring TO authenticated;
GRANT ALL ON public.bmz_monitoring TO service_role;

ALTER TABLE public.bmz_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monitors manage own bmz records"
ON public.bmz_monitoring
FOR ALL
TO authenticated
USING (monitor_id = auth.uid())
WITH CHECK (monitor_id = auth.uid());

CREATE POLICY "Owner/admin read all bmz records"
ON public.bmz_monitoring
FOR SELECT
TO authenticated
USING (is_owner_or_co_owner(auth.uid()) OR is_admin(auth.uid()));

CREATE TRIGGER update_bmz_monitoring_updated_at
BEFORE UPDATE ON public.bmz_monitoring
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX idx_bmz_monitoring_submission_uuid ON public.bmz_monitoring(submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE INDEX idx_bmz_monitoring_monitor ON public.bmz_monitoring(monitor_id);
CREATE INDEX idx_bmz_monitoring_status ON public.bmz_monitoring(status);