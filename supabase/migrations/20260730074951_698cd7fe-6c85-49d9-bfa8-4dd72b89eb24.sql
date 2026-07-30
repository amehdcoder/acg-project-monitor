ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS geotagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.microplan_entries
SET geotagged = true
WHERE geotagged = false
  AND community_latitude IS NOT NULL AND community_longitude IS NOT NULL
  AND (community_latitude <> 0 OR community_longitude <> 0);

CREATE INDEX IF NOT EXISTS idx_microplan_entries_geotagged
  ON public.microplan_entries (project_id, geotagged);