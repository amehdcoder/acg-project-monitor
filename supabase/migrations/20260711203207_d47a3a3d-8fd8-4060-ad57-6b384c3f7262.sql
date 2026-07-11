-- 1. custom_banks: restrict INSERT to admins/owners
DROP POLICY IF EXISTS "Authenticated users can add custom banks" ON public.custom_banks;
CREATE POLICY "Admins can add custom banks"
ON public.custom_banks
FOR INSERT
TO authenticated
WITH CHECK ((is_admin(auth.uid()) OR is_owner(auth.uid())) AND auth.uid() = created_by);

-- 2. learning_log_entries: restrict SELECT to authors and admins/owners
DROP POLICY IF EXISTS "Anyone signed in can view learning log entries" ON public.learning_log_entries;
CREATE POLICY "Authors and admins can view learning log entries"
ON public.learning_log_entries
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'systems_admin'::app_role)
  OR is_owner(auth.uid())
);

-- 3. office_form_approvers: restrict SELECT to the assigned user and admins/owners
DROP POLICY IF EXISTS "Anyone authed can view approvers" ON public.office_form_approvers;
CREATE POLICY "Users see own approver rows, admins see all"
ON public.office_form_approvers
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR is_admin(auth.uid())
  OR is_owner(auth.uid())
);

-- 4. stock_approver_assignments: restrict SELECT to the assigned user and admins/owners
DROP POLICY IF EXISTS "Authenticated can view approvers" ON public.stock_approver_assignments;
CREATE POLICY "Users see own stock approver rows, admins see all"
ON public.stock_approver_assignments
FOR SELECT
TO authenticated
USING (
  auth.uid() = approver_user_id
  OR is_admin(auth.uid())
  OR is_owner(auth.uid())
);