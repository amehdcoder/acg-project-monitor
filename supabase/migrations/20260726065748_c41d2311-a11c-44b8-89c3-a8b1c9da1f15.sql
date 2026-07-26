
-- Add active_version_number to kobo_form_configs
ALTER TABLE public.kobo_form_configs
  ADD COLUMN IF NOT EXISTS active_version_number INTEGER NOT NULL DEFAULT 1;

-- Create versioned mapping history table
CREATE TABLE IF NOT EXISTS public.kobo_mapping_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.kobo_form_configs(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  form_uid TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  field_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT NOT NULL DEFAULT 'Manual mapping update',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (config_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_kobo_mapping_history_config
  ON public.kobo_mapping_history(config_id, version_number DESC);

GRANT SELECT, INSERT ON public.kobo_mapping_history TO authenticated;
GRANT ALL ON public.kobo_mapping_history TO service_role;

ALTER TABLE public.kobo_mapping_history ENABLE ROW LEVEL SECURITY;

-- Only Super Admins, Systems Admins, or Owner/Co-Owners can view or insert
CREATE POLICY "kobo_mapping_history_admin_read"
  ON public.kobo_mapping_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR public.is_owner_or_co_owner(auth.uid())
  );

CREATE POLICY "kobo_mapping_history_admin_insert"
  ON public.kobo_mapping_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR public.is_owner_or_co_owner(auth.uid())
  );

-- Annotate ingested webhook events with the mapping version that produced them
ALTER TABLE public.kobo_webhook_events
  ADD COLUMN IF NOT EXISTS mapping_version_number INTEGER;
