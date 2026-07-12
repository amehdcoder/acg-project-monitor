ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_version TEXT;

COMMENT ON COLUMN public.profiles.current_version IS 'Client app version string (e.g. 2.1.0) reported on sync/heartbeat';