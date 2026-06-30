
-- Auto-grant CES field roles (Locator + Surveyor) to a project member when they
-- conduct a Household Coverage Survey from a project-locked checklist link.
CREATE OR REPLACE FUNCTION public.ensure_ces_field_roles(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_member boolean;
BEGIN
  IF _uid IS NULL OR _project_id IS NULL THEN
    RETURN;
  END IF;

  -- Only members assigned to the project (or owner/admin) get the auto-grant.
  SELECT (
    is_owner(_uid) OR is_admin(_uid) OR EXISTS (
      SELECT 1 FROM public.user_project_assignments upa
      WHERE upa.user_id = _uid AND upa.project_id = _project_id
    )
  ) INTO _is_member;

  IF NOT _is_member THEN
    RETURN;
  END IF;

  INSERT INTO public.ces_role_assignments (user_id, project_id, role, granted_by)
  SELECT _uid, _project_id, r, _uid
  FROM (VALUES ('community_locator'), ('household_surveyor')) AS t(r)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Prevent duplicate role rows so ON CONFLICT works and bulk grants are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS ces_role_assignments_unique
  ON public.ces_role_assignments (user_id, project_id, role);

-- Owner/Admin bulk grant of any CES roles to many members at once.
CREATE OR REPLACE FUNCTION public.bulk_grant_ces_roles(
  _project_id uuid,
  _user_ids uuid[],
  _roles text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _granter uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF NOT (is_owner(_granter) OR is_admin(_granter)) THEN
    RAISE EXCEPTION 'Only owners or admins can grant CES roles';
  END IF;

  INSERT INTO public.ces_role_assignments (user_id, project_id, role, granted_by)
  SELECT u, _project_id, r, _granter
  FROM unnest(_user_ids) AS u
  CROSS JOIN unnest(_roles) AS r
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_ces_field_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_grant_ces_roles(uuid, uuid[], text[]) TO authenticated;
