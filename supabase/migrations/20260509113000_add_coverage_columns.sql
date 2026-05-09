-- Migration to add columns for Therapeutic and Geographic Coverage

-- Add to ces_household_visits
ALTER TABLE public.ces_household_visits 
ADD COLUMN eligible_persons integer DEFAULT 0,
ADD COLUMN treated_persons integer DEFAULT 0;

-- Add to ces_households (for consistency in 3D Map view)
ALTER TABLE public.ces_households 
ADD COLUMN eligible_persons integer DEFAULT 0,
ADD COLUMN treated_persons integer DEFAULT 0;

-- Add to ces_surveys
ALTER TABLE public.ces_surveys 
ADD COLUMN reported_total_hh_per_segment jsonb DEFAULT '{}'::jsonb,
ADD COLUMN therapeutic_coverage_pct numeric,
ADD COLUMN geographic_coverage_pct numeric;

-- Add to microplan_entries
ALTER TABLE public.microplan_entries 
ADD COLUMN total_households_reported integer,
ADD COLUMN total_households_treated integer;
