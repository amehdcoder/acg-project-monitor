
-- CES therapeutic + geographic coverage capture

ALTER TABLE public.ces_household_visits
  ADD COLUMN IF NOT EXISTS eligible_persons integer,
  ADD COLUMN IF NOT EXISTS treated_persons integer,
  ADD COLUMN IF NOT EXISTS treatment_took_place boolean GENERATED ALWAYS AS (COALESCE(treated_persons, 0) > 0) STORED;

ALTER TABLE public.ces_segments
  ADD COLUMN IF NOT EXISTS total_hh_in_segment integer,
  ADD COLUMN IF NOT EXISTS hh_treated_in_segment integer;

-- Microplanning: HHs visited / where treatment took place (number_of_households is the denominator already)
ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS households_treated integer;
