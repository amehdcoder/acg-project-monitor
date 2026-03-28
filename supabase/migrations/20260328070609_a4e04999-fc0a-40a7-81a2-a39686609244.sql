
ALTER TABLE public.microplan_entries
ADD COLUMN year_of_microplanning integer DEFAULT EXTRACT(YEAR FROM now())::integer,
ADD COLUMN population_source text DEFAULT NULL;
