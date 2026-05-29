ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS pwd_total integer,
  ADD COLUMN IF NOT EXISTS pwd_visual integer,
  ADD COLUMN IF NOT EXISTS pwd_hearing integer,
  ADD COLUMN IF NOT EXISTS pwd_physical integer,
  ADD COLUMN IF NOT EXISTS pwd_intellectual integer,
  ADD COLUMN IF NOT EXISTS pwd_communication integer,
  ADD COLUMN IF NOT EXISTS pwd_selfcare integer,
  ADD COLUMN IF NOT EXISTS pwd_albinism integer;