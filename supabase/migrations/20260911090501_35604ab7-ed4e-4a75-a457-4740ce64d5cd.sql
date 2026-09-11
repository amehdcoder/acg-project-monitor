ALTER TABLE public.project_access_configs
  ADD COLUMN IF NOT EXISTS collector_user_id uuid;