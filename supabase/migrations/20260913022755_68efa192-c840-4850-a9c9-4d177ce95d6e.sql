
-- 1) office_form_submissions: no self-approval at insert or update
DROP POLICY IF EXISTS "Users insert own office submissions" ON public.office_form_submissions;
CREATE POLICY "Users insert own office submissions"
ON public.office_form_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = submitted_by
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      COALESCE(approval_status, 'pending') = 'pending'
      AND approved_by IS NULL
      AND approved_at IS NULL
      AND approver_action IS NULL
      AND approver_notes IS NULL
    )
  )
);

DROP POLICY IF EXISTS "Users and approvers update office submissions" ON public.office_form_submissions;
CREATE POLICY "Users and approvers update office submissions"
ON public.office_form_submissions
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = submitted_by
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_office_approver(auth.uid(), office_form_approver_role(form_code)) AND submitted_by <> (SELECT auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_office_approver(auth.uid(), office_form_approver_role(form_code)) AND submitted_by <> (SELECT auth.uid()))
  OR (
    (SELECT auth.uid()) = submitted_by
    AND COALESCE(approval_status, 'pending') = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND approver_action IS NULL
    AND approver_notes IS NULL
  )
);

-- 2) stock_requests: requesters cannot approve/resolve their own requests
DROP POLICY IF EXISTS "Requester or approver can update requests" ON public.stock_requests;
CREATE POLICY "Requester or approver can update requests"
ON public.stock_requests
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = requested_by
  OR (SELECT auth.uid()) = approver_id
  OR is_admin(auth.uid())
  OR is_owner(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
  OR is_owner(auth.uid())
  OR (
    (SELECT auth.uid()) = approver_id
    AND requested_by <> (SELECT auth.uid())
  )
  OR (
    (SELECT auth.uid()) = requested_by
    AND status = 'pending'
    AND approver_id IS NULL
    AND resolved_by IS NULL
  )
);
