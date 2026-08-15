ALTER TABLE public.seeclear_monitoring ALTER COLUMN monitor_id DROP NOT NULL;
ALTER TABLE public.seeclear_monitoring ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE public.seeclear_monitoring ADD COLUMN IF NOT EXISTS kobo_form_uid text;
ALTER TABLE public.seeclear_monitoring ADD COLUMN IF NOT EXISTS kobo_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS seeclear_monitoring_submission_uuid_key
  ON public.seeclear_monitoring (submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS seeclear_monitoring_state_lga_idx ON public.seeclear_monitoring (state, lga);