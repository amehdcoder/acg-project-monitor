-- 1) case_permissions: sharing configuration only visible to case managers/owners
--    and to the individual whose share row it is.
DROP POLICY IF EXISTS "View case permissions for accessible cases" ON public.case_permissions;
CREATE POLICY "View case sharing for managers or the shared user"
ON public.case_permissions
FOR SELECT
TO authenticated
USING (
  public.can_manage_case(auth.uid(), case_id)
  OR shared_with_user_id = auth.uid()
  OR granted_by = auth.uid()
);

-- 2) office_form_submissions: approval fields can never be forged by submitters.
DROP POLICY IF EXISTS "Users and approvers update office submissions" ON public.office_form_submissions;
CREATE POLICY "Users and approvers update office submissions"
ON public.office_form_submissions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = submitted_by
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
  OR (
    auth.uid() = submitted_by
    AND approval_status = 'pending'::text
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND approver_action IS NULL
    AND approver_notes IS NULL
  )
);

-- Insert path: submitters may not seed approval decision fields.
DROP POLICY IF EXISTS "Users insert own office submissions" ON public.office_form_submissions;
CREATE POLICY "Users insert own office submissions"
ON public.office_form_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitted_by
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
    OR (
      coalesce(approval_status, 'pending') = 'pending'
      AND approved_by IS NULL
      AND approved_at IS NULL
      AND approver_action IS NULL
      AND approver_notes IS NULL
    )
  )
);

-- Trigger-level defence in depth for inserts (mirrors the existing UPDATE guard).
CREATE OR REPLACE FUNCTION public.guard_office_form_approval_insert()
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

  IF NEW.approved_by IS NOT NULL
     OR NEW.approved_at IS NOT NULL
     OR NEW.approver_action IS NOT NULL
     OR NEW.approver_notes IS NOT NULL
     OR coalesce(NEW.approval_status, 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'Only the assigned approver can set approval fields';
  END IF;

  NEW.approval_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_office_form_approval_insert ON public.office_form_submissions;
CREATE TRIGGER guard_office_form_approval_insert
BEFORE INSERT ON public.office_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_office_form_approval_insert();