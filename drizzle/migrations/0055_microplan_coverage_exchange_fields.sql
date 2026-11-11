ALTER TABLE public.microplan_entries ADD COLUMN IF NOT EXISTS medicine_returns jsonb;
ALTER TABLE public.microplan_medicine_allocations ADD COLUMN IF NOT EXISTS jrsm_target integer;
ALTER TABLE public.microplan_medicine_allocations ADD COLUMN IF NOT EXISTS community_snapshot jsonb;
COMMENT ON COLUMN public.microplan_medicine_allocations.community_snapshot IS 'Saved per-community allocation at explicit administrator save; retained until administrator update or removal.';
COMMENT ON COLUMN public.microplan_entries.medicine_returns IS 'Coverage Excel medicine-specific quantities used, returned and damaged with explicit dispensing units; allocation is never overwritten by coverage imports.';