-- Keep the form-scope helper fast and include explicit MDA dashboard grants.
-- "forms" is the project_forms/catalog path in this schema.
CREATE OR REPLACE FUNCTION public.accessible_form_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT form_id), ARRAY[]::uuid[])
  FROM (
    SELECT ufa.form_id
    FROM public.user_form_assignments ufa
    WHERE ufa.user_id = _user_id

    UNION

    SELECT sfa.form_id
    FROM public.sarmaan_form_access sfa
    WHERE sfa.user_id = _user_id

    UNION

    SELECT f.id AS form_id
    FROM public.forms f
    WHERE f.project_id = ANY(public.accessible_project_ids(_user_id))

    UNION

    SELECT f.id AS form_id
    FROM public.forms f
    JOIN public.dashboard_access da
      ON (da.project_id IS NULL OR da.project_id = f.project_id)
    WHERE da.user_id = _user_id
      AND da.dashboard_id = 'mda_supervisory'
      AND (
        COALESCE(f.settings ->> 'isMdaChecklist', '') IN ('true', '1')
        OR lower(f.name) LIKE '%integrated mda supervisory checklist%'
        OR lower(f.name) LIKE '%mda supervisory checklist%'
      )
  ) visible;
$$;

REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO service_role;

-- Indexes used by the helper and dashboard list ordering.
CREATE INDEX IF NOT EXISTS idx_dashboard_access_user_dashboard_project
  ON public.dashboard_access (user_id, dashboard_id, project_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_submitted_created_id
  ON public.form_submissions (form_id, submitted_at DESC NULLS LAST, created_at DESC, id DESC);

-- Rebuild RLS policies with init-plan subqueries so helper arrays are computed
-- once per statement, not once for every candidate row.
DROP POLICY IF EXISTS "Assigned users can view projects" ON public.projects;
CREATE POLICY "Assigned users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  id = ANY(ARRAY(SELECT unnest(public.accessible_project_ids((SELECT auth.uid())))))
);

DROP POLICY IF EXISTS "Assigned users can view forms" ON public.forms;
DROP POLICY IF EXISTS "SARMAAN project members can view ACSM checklist forms" ON public.forms;
DROP POLICY IF EXISTS "Sarmaan grantees can view forms" ON public.forms;

CREATE POLICY "Assigned users can view forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  id = ANY(ARRAY(SELECT unnest(public.accessible_form_ids((SELECT auth.uid())))))
);

CREATE POLICY "SARMAAN project members can view ACSM checklist forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  (settings ->> 'sarmaan_acsm') = 'true'
  AND project_id = ANY(ARRAY(SELECT unnest(public.accessible_project_ids((SELECT auth.uid())))))
);

CREATE POLICY "Sarmaan grantees can view forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  id = ANY(ARRAY(SELECT unnest(public.accessible_form_ids((SELECT auth.uid())))))
);

DROP POLICY IF EXISTS "Users read reference locations in scope" ON public.reference_locations;
CREATE POLICY "Users read reference locations in scope"
ON public.reference_locations
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR project_id IS NULL
  OR (SELECT public.is_admin((SELECT auth.uid())))
  OR project_id = ANY(ARRAY(SELECT unnest(public.accessible_project_ids((SELECT auth.uid())))))
);

DROP POLICY IF EXISTS "Assigned users can view form submissions" ON public.form_submissions;
CREATE POLICY "Assigned users can view form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (
  form_id = ANY(ARRAY(SELECT unnest(public.accessible_form_ids((SELECT auth.uid())))))
);