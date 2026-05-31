DROP POLICY IF EXISTS "Users view own uprp submissions" ON public.uprp_submissions;

CREATE POLICY "Users view own uprp submissions"
ON public.uprp_submissions
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.is_owner(auth.uid())
);