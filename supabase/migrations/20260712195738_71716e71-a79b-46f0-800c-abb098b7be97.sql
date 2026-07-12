CREATE OR REPLACE FUNCTION public.accessible_project_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT project_id), ARRAY[]::uuid[])
  FROM (
    SELECT upa.project_id
    FROM public.user_project_assignments upa
    WHERE upa.user_id = _user_id

    UNION

    SELECT da.project_id
    FROM public.dashboard_access da
    WHERE da.user_id = _user_id
      AND da.dashboard_id = 'mda_supervisory'
      AND da.project_id IS NOT NULL

    UNION

    SELECT f.project_id
    FROM public.dashboard_access da
    JOIN public.forms f ON TRUE
    WHERE da.user_id = _user_id
      AND da.dashboard_id = 'mda_supervisory'
      AND da.project_id IS NULL
      AND (
        COALESCE(f.settings ->> 'isMdaChecklist', '') IN ('true', '1')
        OR lower(f.name) LIKE '%integrated mda supervisory checklist%'
        OR lower(f.name) LIKE '%mda supervisory checklist%'
      )
  ) visible;
$$;

REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO service_role;