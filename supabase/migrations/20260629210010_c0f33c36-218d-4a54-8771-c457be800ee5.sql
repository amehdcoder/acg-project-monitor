ALTER TABLE public.irf_reports
  ADD COLUMN IF NOT EXISTS form_category text,
  ADD COLUMN IF NOT EXISTS reporting_level text,
  ADD COLUMN IF NOT EXISTS ministry_department text,
  ADD COLUMN IF NOT EXISTS outcome_level text,
  ADD COLUMN IF NOT EXISTS visit_date date,
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;