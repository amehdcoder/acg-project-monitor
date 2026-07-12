-- Performance-focused access helpers for project/form/submission scope.
-- They are SECURITY DEFINER so policy checks do not recursively re-run RLS on
-- assignment tables, and STABLE so Postgres can cache them per statement.
CREATE OR REPLACE FUNCTION public.accessible_project_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT upa.project_id), ARRAY[]::uuid[])
  FROM public.user_project_assignments upa
  WHERE upa.user_id = _user_id;
$$;

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
  ) visible;
$$;

REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO service_role;

-- Indexes used by RLS helpers and dashboard/list queries.
CREATE INDEX IF NOT EXISTS idx_projects_name_id ON public.projects (name, id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON public.forms (created_by);
CREATE INDEX IF NOT EXISTS idx_forms_mda_checklist_flag ON public.forms (((settings ->> 'isMdaChecklist')), project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reference_locations_created_by ON public.reference_locations (created_by);
CREATE INDEX IF NOT EXISTS idx_reference_locations_parent_id ON public.reference_locations (parent_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_submitted_id ON public.form_submissions (form_id, submitted_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_form_submitted ON public.form_submissions (user_id, form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- Rebuild projects policies with init-plan friendly helpers.
DROP POLICY IF EXISTS "Admins can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Assigned users can view projects" ON public.projects;
DROP POLICY IF EXISTS "Microplan form access users can view projects" ON public.projects;

CREATE POLICY "Admins can manage projects"
ON public.projects
FOR ALL
TO authenticated
USING ((SELECT public.is_admin((SELECT auth.uid()))))
WITH CHECK ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY "Assigned users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING (id = ANY(public.accessible_project_ids((SELECT auth.uid()))));

CREATE POLICY "Microplan form access users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING ((SELECT public.has_microplan_form_access((SELECT auth.uid()))));

-- Rebuild forms policies. This is the real project_forms path in this schema.
DROP POLICY IF EXISTS "Admins can view all forms" ON public.forms;
DROP POLICY IF EXISTS "Admins can create forms" ON public.forms;
DROP POLICY IF EXISTS "Assigned users can view forms" ON public.forms;
DROP POLICY IF EXISTS "SARMAAN project members can view ACSM checklist forms" ON public.forms;
DROP POLICY IF EXISTS "Sarmaan grantees can view forms" ON public.forms;

CREATE POLICY "Admins can view all forms"
ON public.forms
FOR SELECT
TO authenticated
USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY "Admins can create forms"
ON public.forms
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY "Assigned users can view forms"
ON public.forms
FOR SELECT
TO authenticated
USING (id = ANY(public.accessible_form_ids((SELECT auth.uid()))));

CREATE POLICY "SARMAAN project members can view ACSM checklist forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  (settings ->> 'sarmaan_acsm') = 'true'
  AND project_id = ANY(public.accessible_project_ids((SELECT auth.uid())))
);

CREATE POLICY "Sarmaan grantees can view forms"
ON public.forms
FOR SELECT
TO authenticated
USING (id = ANY(public.accessible_form_ids((SELECT auth.uid()))));

-- Rebuild reference location read policy to avoid per-row joins.
DROP POLICY IF EXISTS "Users read reference locations in scope" ON public.reference_locations;

CREATE POLICY "Users read reference locations in scope"
ON public.reference_locations
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR project_id IS NULL
  OR (SELECT public.is_admin((SELECT auth.uid())))
  OR project_id = ANY(public.accessible_project_ids((SELECT auth.uid())))
);

-- Rebuild submission visibility to match count/list scope exactly.
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Assigned users can view form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Owners can view all submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Users can manage their own submissions" ON public.form_submissions;

CREATE POLICY "Admins can view all submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY "Owners can view all submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING ((SELECT public.is_owner_or_co_owner((SELECT auth.uid()))));

CREATE POLICY "Assigned users can view form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (form_id = ANY(public.accessible_form_ids((SELECT auth.uid()))));

CREATE POLICY "Users can manage their own submissions"
ON public.form_submissions
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);