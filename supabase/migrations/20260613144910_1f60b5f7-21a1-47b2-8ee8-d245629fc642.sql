CREATE TABLE public.seeclear_monitoring (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  monitor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_visit date,
  state text,
  lga text,
  ward text,
  community text,
  facility_name text,
  facility_level text,
  ownership text,
  functional_status text,
  is_functional boolean,
  staff_on_duty integer,
  focal_name text,
  focal_designation text,
  focal_phone text,
  team_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy double precision,
  general jsonb NOT NULL DEFAULT '{}'::jsonb,
  hr_score integer,
  hr_max integer,
  infra_score integer,
  infra_max integer,
  equipment jsonb NOT NULL DEFAULT '{}'::jsonb,
  equip_score integer,
  equip_max integer,
  essential_supplies boolean,
  complete_records boolean,
  referral_compliance boolean,
  referrals_made integer,
  referrals_completed integer,
  readiness_score numeric,
  overall_score integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  challenges jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  officer_signature text,
  incharge_signature text,
  critical_gap text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seeclear_monitoring TO authenticated;
GRANT ALL ON public.seeclear_monitoring TO service_role;

ALTER TABLE public.seeclear_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monitors manage own seeclear records"
ON public.seeclear_monitoring
FOR ALL
TO authenticated
USING (monitor_id = auth.uid())
WITH CHECK (monitor_id = auth.uid());

CREATE POLICY "Owner/admin read all seeclear records"
ON public.seeclear_monitoring
FOR SELECT
TO authenticated
USING (is_owner_or_co_owner(auth.uid()) OR is_admin(auth.uid()));

CREATE TRIGGER update_seeclear_monitoring_updated_at
BEFORE UPDATE ON public.seeclear_monitoring
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_seeclear_monitoring_monitor ON public.seeclear_monitoring(monitor_id);
CREATE INDEX idx_seeclear_monitoring_status ON public.seeclear_monitoring(status);