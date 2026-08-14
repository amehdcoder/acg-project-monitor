-- 1) case_relationships: require access to both sides
DROP POLICY IF EXISTS "Access relationships for accessible cases" ON public.case_relationships;
CREATE POLICY "Access relationships for accessible cases"
ON public.case_relationships
AS PERMISSIVE
FOR ALL
USING (public.can_access_case(auth.uid(), parent_case_id) OR public.can_access_case(auth.uid(), child_case_id))
WITH CHECK (public.can_access_case(auth.uid(), parent_case_id) AND public.can_access_case(auth.uid(), child_case_id));

-- 2) cases: add WITH CHECK to UPDATE
DROP POLICY IF EXISTS "Users can update their own cases or admins can update any" ON public.cases;
CREATE POLICY "Users can update their own cases or admins can update any"
ON public.cases
FOR UPDATE
USING ((owner_id = auth.uid()) OR public.is_admin(auth.uid()))
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    owner_id = auth.uid()
    AND (
      project_id IS NULL
      OR project_id IN (SELECT project_id FROM public.user_project_assignments WHERE user_id = auth.uid())
    )
  )
);

CREATE OR REPLACE FUNCTION public.guard_case_ownership_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Only administrators can reassign case ownership';
  END IF;
  IF NEW.sharing_level IS DISTINCT FROM OLD.sharing_level THEN
    RAISE EXCEPTION 'Only administrators can change case sharing level';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_case_ownership_transfer ON public.cases;
CREATE TRIGGER guard_case_ownership_transfer
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.guard_case_ownership_transfer();

-- 3) office_form_submissions: block submitters from self-approving
DROP POLICY IF EXISTS "Users and approvers update office submissions" ON public.office_form_submissions;
CREATE POLICY "Users and approvers update office submissions"
ON public.office_form_submissions
FOR UPDATE
USING (
  (auth.uid() = submitted_by)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
  OR (auth.uid() = submitted_by AND approval_status = 'pending')
);

CREATE OR REPLACE FUNCTION public.guard_office_form_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'super_admin'::app_role)
     OR public.is_office_approver(auth.uid(), public.office_form_approver_role(NEW.form_code)) THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approver_notes IS DISTINCT FROM OLD.approver_notes
     OR NEW.approver_action IS DISTINCT FROM OLD.approver_action
     OR NEW.next_step IS DISTINCT FROM OLD.next_step
     OR NEW.approved_items IS DISTINCT FROM OLD.approved_items
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.form_code IS DISTINCT FROM OLD.form_code THEN
    RAISE EXCEPTION 'Only the assigned approver can change approval fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_office_form_approval_fields ON public.office_form_submissions;
CREATE TRIGGER guard_office_form_approval_fields
BEFORE UPDATE ON public.office_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_office_form_approval_fields();