
-- Fix: the activity union has 6 columns; ORDER BY position 7 is invalid.
CREATE OR REPLACE FUNCTION public.donor_field_activity(_project_id UUID, _limit INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_donor_viewer(_project_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'kind', kind, 'summary', summary, 'component', component,
    'state', state, 'lga', lga, 'occurred_at', occurred_at
  ) ORDER BY occurred_at DESC)
  INTO result
  FROM (
    SELECT 'service'::text kind,
           COALESCE(service_name, 'Service recorded')::text summary,
           component_key::text component,
           NULL::text state, NULL::text lga,
           COALESCE(service_date::timestamptz, created_at) occurred_at
      FROM public.beneficiary_services WHERE project_id = _project_id
    UNION ALL
    SELECT 'home_visit', 'Home visit ' || COALESCE(status, 'recorded'),
           NULL, NULL, NULL,
           COALESCE(visited_at, created_at)
      FROM public.beneficiary_home_visits WHERE project_id = _project_id
    UNION ALL
    SELECT 'feedback', 'Community feedback: ' || COALESCE(category, 'general'),
           NULL, state, lga,
           created_at
      FROM public.project_feedback WHERE project_id = _project_id
    ORDER BY occurred_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 100))
  ) feed;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.donor_field_activity(UUID, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.donor_field_activity(UUID, INT) TO authenticated;
