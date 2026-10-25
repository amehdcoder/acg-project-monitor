ALTER TABLE public.project_access_configs ADD COLUMN IF NOT EXISTS allow_microplanning boolean NOT NULL DEFAULT false;
ALTER TABLE public.microplan_entries ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.microplan_entries ADD COLUMN IF NOT EXISTS collector_label text;
COMMENT ON COLUMN public.project_access_configs.allow_microplanning IS 'Allows project-scoped enrolled devices to insert microplan entries through verified intake only.';