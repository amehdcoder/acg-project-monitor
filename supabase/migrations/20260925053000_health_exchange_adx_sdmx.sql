ALTER TABLE public.health_exchange_connections
  DROP CONSTRAINT IF EXISTS health_exchange_connections_kind_check;
ALTER TABLE public.health_exchange_connections
  ADD CONSTRAINT health_exchange_connections_kind_check CHECK (kind IN ('dhis2','fhir','lmis','sdmx'));
ALTER TABLE public.health_exchange_connections
  DROP CONSTRAINT IF EXISTS health_exchange_connections_auth_type_check;
ALTER TABLE public.health_exchange_connections
  ADD CONSTRAINT health_exchange_connections_auth_type_check CHECK (auth_type IN ('bearer','basic','none','apitoken','oauth2_client_credentials'));
ALTER TABLE public.health_exchange_connections
  ADD COLUMN IF NOT EXISTS exchange_format text NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS token_url text,
  ADD COLUMN IF NOT EXISTS agency_id text,
  ADD COLUMN IF NOT EXISTS dataflow_id text,
  ADD COLUMN IF NOT EXISTS dataflow_version text DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS dsd_id text,
  ADD COLUMN IF NOT EXISTS default_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.health_exchange_mappings
  ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;
