ALTER TABLE public.project_access_configs
  ADD COLUMN IF NOT EXISTS allow_seeclear boolean NOT NULL DEFAULT false;