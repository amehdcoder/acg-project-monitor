
CREATE TABLE IF NOT EXISTS public.ces_witness_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID,
  household_id UUID,
  witness_device_hash TEXT NOT NULL,
  witness_lat DOUBLE PRECISION,
  witness_long DOUBLE PRECISION,
  witness_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_witness_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit witness verification" ON public.ces_witness_logs;
CREATE POLICY "Anyone can submit witness verification"
ON public.ces_witness_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins and owners view witness logs" ON public.ces_witness_logs;
CREATE POLICY "Admins and owners view witness logs"
ON public.ces_witness_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ces_witness_logs_survey ON public.ces_witness_logs(survey_id);
CREATE INDEX IF NOT EXISTS idx_ces_witness_logs_household ON public.ces_witness_logs(household_id);
