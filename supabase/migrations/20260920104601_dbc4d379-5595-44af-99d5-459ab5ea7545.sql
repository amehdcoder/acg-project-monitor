ALTER TABLE public.mmdp_potential_cases
  ADD COLUMN IF NOT EXISTS symptoms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment jsonb NOT NULL DEFAULT '{}'::jsonb;