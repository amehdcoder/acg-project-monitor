ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS total_households_reported integer,
  ADD COLUMN IF NOT EXISTS total_households_treated integer;