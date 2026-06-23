-- Server-side distinct geography aggregation for the MDA location cascade.
-- SECURITY INVOKER (default) so existing RLS scoping on microplan_entries
-- continues to apply per-user; returns only DISTINCT geography tuples instead
-- of every row (drives cascade dropdowns at a fraction of the payload).
CREATE OR REPLACE FUNCTION public.microplan_distinct_geography(_states text[] DEFAULT NULL)
RETURNS TABLE(
  state text,
  lga text,
  ward text,
  flhf_name text,
  community_name text,
  settlement_name text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    e.state,
    e.lga,
    e.ward,
    e.flhf_name,
    e.community_name,
    e.settlement_name
  FROM public.microplan_entries e
  WHERE (_states IS NULL OR cardinality(_states) = 0 OR e.state = ANY(_states));
$$;

GRANT EXECUTE ON FUNCTION public.microplan_distinct_geography(text[]) TO authenticated, service_role;

-- Indexes that keep the large-volume paginated/aggregated reads off full scans.
CREATE INDEX IF NOT EXISTS idx_microplan_entries_state
  ON public.microplan_entries (state);

CREATE INDEX IF NOT EXISTS idx_microplan_entries_project_id_id
  ON public.microplan_entries (project_id, id);

-- Keyset-friendly index for the global CES gap-intelligence scan.
CREATE INDEX IF NOT EXISTS idx_ces_household_visits_coverage_id
  ON public.ces_household_visits (coverage_status, id);

CREATE INDEX IF NOT EXISTS idx_ces_household_visits_survey_id_id
  ON public.ces_household_visits (survey_id, id);

CREATE INDEX IF NOT EXISTS idx_ces_households_session_id_id
  ON public.ces_households (session_id, id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id_id
  ON public.form_submissions (form_id, id);