-- 1) Scope dashboard edit rights to owner / creator / form manager -----------

CREATE OR REPLACE FUNCTION public.can_create_dashboard(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_owner_level(_user_id)
     OR (
          public.is_admin(_user_id)
          AND (_form_id IS NULL OR public.can_manage_form(_user_id, _form_id))
        );
$$;

REVOKE ALL ON FUNCTION public.can_create_dashboard(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_create_dashboard(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_edit_dashboard_row(_user_id uuid, _dashboard_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_owner_level(_user_id)
     OR EXISTS (
          SELECT 1
          FROM public.custom_dashboards d
          WHERE d.id = _dashboard_id
            AND (
              d.created_by = _user_id
              OR (
                public.is_admin(_user_id)
                AND (d.form_id IS NULL OR public.can_manage_form(_user_id, d.form_id))
              )
            )
        );
$$;

REVOKE ALL ON FUNCTION public.can_edit_dashboard_row(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_dashboard_row(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Editors manage all dashboards" ON public.custom_dashboards;
DROP POLICY IF EXISTS "Admins can create dashboards" ON public.custom_dashboards;
DROP POLICY IF EXISTS "Admins can update dashboards" ON public.custom_dashboards;
DROP POLICY IF EXISTS "Admins can delete dashboards" ON public.custom_dashboards;

CREATE POLICY "Scoped editors create dashboards"
ON public.custom_dashboards FOR INSERT TO authenticated
WITH CHECK (
  public.can_create_dashboard((SELECT auth.uid()), form_id)
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY "Scoped editors update dashboards"
ON public.custom_dashboards FOR UPDATE TO authenticated
USING (public.can_edit_dashboard_row((SELECT auth.uid()), id))
WITH CHECK (
  public.can_edit_dashboard_row((SELECT auth.uid()), id)
  AND public.can_create_dashboard((SELECT auth.uid()), form_id)
);

CREATE POLICY "Scoped editors delete dashboards"
ON public.custom_dashboards FOR DELETE TO authenticated
USING (public.can_edit_dashboard_row((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "Editors manage all widgets" ON public.dashboard_widgets;
DROP POLICY IF EXISTS "Admins can create widgets" ON public.dashboard_widgets;
DROP POLICY IF EXISTS "Admins can update widgets" ON public.dashboard_widgets;
DROP POLICY IF EXISTS "Admins can delete widgets" ON public.dashboard_widgets;

CREATE POLICY "Scoped editors create widgets"
ON public.dashboard_widgets FOR INSERT TO authenticated
WITH CHECK (public.can_edit_dashboard_row((SELECT auth.uid()), dashboard_id));

CREATE POLICY "Scoped editors update widgets"
ON public.dashboard_widgets FOR UPDATE TO authenticated
USING (public.can_edit_dashboard_row((SELECT auth.uid()), dashboard_id))
WITH CHECK (public.can_edit_dashboard_row((SELECT auth.uid()), dashboard_id));

CREATE POLICY "Scoped editors delete widgets"
ON public.dashboard_widgets FOR DELETE TO authenticated
USING (public.can_edit_dashboard_row((SELECT auth.uid()), dashboard_id));

-- 2) custom_banks: only the creator (or owner) may remove shared entries -----

DROP POLICY IF EXISTS "Admins can delete custom banks" ON public.custom_banks;

CREATE POLICY "Creators or owners delete custom banks"
ON public.custom_banks FOR DELETE TO authenticated
USING (
  public.is_owner_level((SELECT auth.uid()))
  OR created_by = (SELECT auth.uid())
);

-- 3) office_form_submissions: enforce approval state in the database --------

CREATE OR REPLACE FUNCTION public.guard_office_form_approval_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF has_role(auth.uid(), 'super_admin'::app_role)
     OR public.is_office_approver(auth.uid(), public.office_form_approver_role(NEW.form_code)) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS NOT NULL
     OR NEW.approved_at IS NOT NULL
     OR NEW.approver_action IS NOT NULL
     OR NEW.approver_notes IS NOT NULL
     OR coalesce(NEW.approval_status, 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'Only the assigned approver can set approval fields';
  END IF;

  -- Defence in depth: never trust client-supplied approval state or identity.
  NEW.approval_status := 'pending';
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  NEW.approver_action := NULL;
  NEW.approver_notes := NULL;
  IF auth.uid() IS NOT NULL THEN
    NEW.submitted_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_office_form_approval_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(NEW.approval_status, 'pending') = 'pending'
     AND (NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approver_action IS NOT NULL) THEN
    RAISE EXCEPTION 'A pending submission cannot carry approval details';
  END IF;

  IF coalesce(NEW.approval_status, 'pending') <> 'pending'
     AND NOT (
       has_role(auth.uid(), 'super_admin'::app_role)
       OR public.is_office_approver(auth.uid(), public.office_form_approver_role(NEW.form_code))
     ) THEN
    RAISE EXCEPTION 'Only the assigned approver can decide this submission';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_office_form_approval_state ON public.office_form_submissions;
CREATE TRIGGER enforce_office_form_approval_state
BEFORE INSERT OR UPDATE ON public.office_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_office_form_approval_state();