ALTER TABLE public.livelihood_opportunities
  ADD COLUMN IF NOT EXISTS community text,
  ADD COLUMN IF NOT EXISTS venue_latitude double precision,
  ADD COLUMN IF NOT EXISTS venue_longitude double precision;