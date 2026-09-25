ALTER TABLE public.health_exchange_connections
  ADD COLUMN IF NOT EXISTS auto_push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_push_day smallint NOT NULL DEFAULT 5 CHECK (auto_push_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS auto_push_dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_auto_period text,
  ADD COLUMN IF NOT EXISTS lmis_program_id text;