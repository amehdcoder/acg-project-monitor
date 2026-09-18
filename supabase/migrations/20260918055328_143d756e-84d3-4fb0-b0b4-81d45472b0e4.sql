ALTER TABLE public.beneficiary_home_visits
  ADD COLUMN IF NOT EXISTS visitor_role text,
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS cdd_id uuid REFERENCES public.mmdp_cdds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visited_on date,
  ADD COLUMN IF NOT EXISTS found_at_home boolean,
  ADD COLUMN IF NOT EXISTS next_appointment_date date,
  ADD COLUMN IF NOT EXISTS action_taken text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS reported_by uuid;

CREATE INDEX IF NOT EXISTS beneficiary_home_visits_beneficiary_idx
  ON public.beneficiary_home_visits (beneficiary_id, created_at DESC);