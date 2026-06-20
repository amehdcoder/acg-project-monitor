ALTER TABLE public.microplan_medicine_allocations
  ADD COLUMN IF NOT EXISTS ward text,
  ADD COLUMN IF NOT EXISTS flhf text;