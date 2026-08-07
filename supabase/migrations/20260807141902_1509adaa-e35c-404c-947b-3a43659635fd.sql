ALTER TABLE public.mda_lens_grants
  ADD COLUMN IF NOT EXISTS project_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS campaign_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wards text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.mda_lens_grants.project_ids IS 'Geo Microplanning project dashboards visible through the MDA Lens; empty means all assigned projects.';
COMMENT ON COLUMN public.mda_lens_grants.campaign_types IS 'Integrated Supervisory MDA campaign types visible through the MDA Lens; empty means all campaign types.';
COMMENT ON COLUMN public.mda_lens_grants.wards IS 'Ward names within the selected State/LGA geography scope; empty means all wards in selected LGAs.';