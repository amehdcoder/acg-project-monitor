ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS scope_states text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_lgas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_wards text[] NOT NULL DEFAULT '{}';