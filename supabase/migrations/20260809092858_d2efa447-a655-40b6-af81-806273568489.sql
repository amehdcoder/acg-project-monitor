ALTER TABLE public.microplan_reconciliation
  ADD COLUMN IF NOT EXISTS community_name text,
  ADD COLUMN IF NOT EXISTS settlement_name text,
  ADD COLUMN IF NOT EXISTS microplan_entry_id uuid,
  ADD COLUMN IF NOT EXISTS allocated_quantity numeric,
  ADD COLUMN IF NOT EXISTS override_quantity numeric,
  ADD COLUMN IF NOT EXISTS override_reason text;

CREATE INDEX IF NOT EXISTS idx_microplan_reconciliation_entry
  ON public.microplan_reconciliation (microplan_entry_id);
CREATE INDEX IF NOT EXISTS idx_microplan_reconciliation_project_community
  ON public.microplan_reconciliation (project_id, community_name);