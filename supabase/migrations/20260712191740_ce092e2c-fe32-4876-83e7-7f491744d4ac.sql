
-- Fast, RLS-bypassing lookup helpers for the forms SELECT policies.
-- STABLE so the planner evaluates once per query; SECURITY DEFINER so the
-- junction-table RLS is not re-checked on every candidate row.

CREATE OR REPLACE FUNCTION public.has_form_assignment(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_form_assignments
    WHERE form_id = _form_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_sarmaan_form_grantee(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sarmaan_form_access
    WHERE form_id = _form_id AND user_id = _user_id
  )
$$;

-- is_project_member already exists (project-membership lookup).

-- Restrict execution to signed-in users only.
REVOKE EXECUTE ON FUNCTION public.has_form_assignment(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sarmaan_form_grantee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_form_assignment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sarmaan_form_grantee(uuid, uuid) TO authenticated;

-- Recreate the forms SELECT policies to use the helpers.
DROP POLICY IF EXISTS "Assigned users can view forms" ON public.forms;
CREATE POLICY "Assigned users can view forms"
  ON public.forms FOR SELECT
  TO authenticated
  USING (public.has_form_assignment(auth.uid(), id));

DROP POLICY IF EXISTS "Sarmaan grantees can view forms" ON public.forms;
CREATE POLICY "Sarmaan grantees can view forms"
  ON public.forms FOR SELECT
  TO authenticated
  USING (public.is_sarmaan_form_grantee(auth.uid(), id));

DROP POLICY IF EXISTS "SARMAAN project members can view ACSM checklist forms" ON public.forms;
CREATE POLICY "SARMAAN project members can view ACSM checklist forms"
  ON public.forms FOR SELECT
  TO authenticated
  USING (
    (settings ->> 'sarmaan_acsm') = 'true'
    AND public.is_project_member(auth.uid(), project_id)
  );
