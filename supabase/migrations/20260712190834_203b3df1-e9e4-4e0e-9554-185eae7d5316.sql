-- ============================================================
-- 1. High-performance SECURITY DEFINER lookup helpers
--    (STABLE so the planner evaluates them once per query, and
--     SECURITY DEFINER so RLS on the joined tables isn't re-checked)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = _user_id
      AND upa.project_id = _project_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_microplan_form_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.microplan_form_access mfa
    WHERE mfa.user_id = _user_id
  );
$$;

-- True when the user may read submissions of a given form:
-- direct form assignment, SARMAAN grant, or membership of the form's project.
CREATE OR REPLACE FUNCTION public.can_view_form_submissions(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_form_assignments ufa
    WHERE ufa.form_id = _form_id AND ufa.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.sarmaan_form_access sfa
    WHERE sfa.form_id = _form_id AND sfa.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.forms f
    JOIN public.user_project_assignments upa
      ON upa.project_id = f.project_id
    WHERE f.id = _form_id AND upa.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_microplan_form_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_form_submissions(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. Indexes backing the RLS lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reference_locations_project_id
  ON public.reference_locations (project_id);
CREATE INDEX IF NOT EXISTS idx_user_form_assignments_form_user
  ON public.user_form_assignments (form_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sarmaan_form_access_form_user
  ON public.sarmaan_form_access (form_id, user_id);

-- ============================================================
-- 3. Optimize projects RLS
-- ============================================================
DROP POLICY IF EXISTS "Assigned users can view projects" ON public.projects;
DROP POLICY IF EXISTS "Microplan form access users can view projects" ON public.projects;

CREATE POLICY "Assigned users can view projects"
  ON public.projects FOR SELECT
  USING (public.is_project_member(auth.uid(), id));

CREATE POLICY "Microplan form access users can view projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.has_microplan_form_access(auth.uid()));

-- ============================================================
-- 4. Optimize reference_locations RLS
-- ============================================================
DROP POLICY IF EXISTS "Users read reference locations in scope" ON public.reference_locations;

CREATE POLICY "Users read reference locations in scope"
  ON public.reference_locations FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR project_id IS NULL
    OR public.is_admin(auth.uid())
    OR public.is_project_member(auth.uid(), project_id)
  );

-- ============================================================
-- 5. Consistent submissions read scope for assigned users
--    (so the list matches the aggregate count — no more
--     "628 submissions" vs "No submissions yet" mismatch)
-- ============================================================
DROP POLICY IF EXISTS "Assigned users can view form submissions" ON public.form_submissions;

CREATE POLICY "Assigned users can view form submissions"
  ON public.form_submissions FOR SELECT
  TO authenticated
  USING (public.can_view_form_submissions(auth.uid(), form_id));