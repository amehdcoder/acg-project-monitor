
CREATE OR REPLACE FUNCTION public.can_manage_case(_user_id uuid, _case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.cases c WHERE c.id = _case_id AND c.owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_case(_user_id uuid, _case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_case(_user_id, _case_id)
    OR EXISTS (
      SELECT 1 FROM public.case_permissions cp
      WHERE cp.case_id = _case_id
        AND cp.shared_with_user_id = _user_id
        AND lower(coalesce(cp.share_level, '')) IN ('write','edit','manage','admin','full','owner')
    );
$$;

-- case_permissions: owner/admin manage only
DROP POLICY IF EXISTS "Manage case permissions for accessible cases" ON public.case_permissions;
DROP POLICY IF EXISTS "View case permissions for accessible cases" ON public.case_permissions;
CREATE POLICY "View case permissions for accessible cases" ON public.case_permissions
  FOR SELECT TO authenticated USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Case owners and admins manage sharing" ON public.case_permissions
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_case(auth.uid(), case_id));
CREATE POLICY "Case owners and admins update sharing" ON public.case_permissions
  FOR UPDATE TO authenticated USING (public.can_manage_case(auth.uid(), case_id))
  WITH CHECK (public.can_manage_case(auth.uid(), case_id));
CREATE POLICY "Case owners and admins delete sharing" ON public.case_permissions
  FOR DELETE TO authenticated USING (public.can_manage_case(auth.uid(), case_id));

-- case_tasks
DROP POLICY IF EXISTS "Access tasks for accessible cases" ON public.case_tasks;
CREATE POLICY "View tasks for accessible cases" ON public.case_tasks
  FOR SELECT TO authenticated USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Write tasks for editable cases" ON public.case_tasks
  FOR INSERT TO authenticated WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Update tasks for editable cases" ON public.case_tasks
  FOR UPDATE TO authenticated USING (public.can_write_case(auth.uid(), case_id))
  WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Delete tasks for editable cases" ON public.case_tasks
  FOR DELETE TO authenticated USING (public.can_write_case(auth.uid(), case_id));

-- case_referrals
DROP POLICY IF EXISTS "Access referrals for accessible cases" ON public.case_referrals;
CREATE POLICY "View referrals for accessible cases" ON public.case_referrals
  FOR SELECT TO authenticated USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Write referrals for editable cases" ON public.case_referrals
  FOR INSERT TO authenticated WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Update referrals for editable cases" ON public.case_referrals
  FOR UPDATE TO authenticated USING (public.can_write_case(auth.uid(), case_id))
  WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Delete referrals for editable cases" ON public.case_referrals
  FOR DELETE TO authenticated USING (public.can_write_case(auth.uid(), case_id));

-- case_relationships
DROP POLICY IF EXISTS "Access relationships for accessible cases" ON public.case_relationships;
CREATE POLICY "View relationships for accessible cases" ON public.case_relationships
  FOR SELECT TO authenticated USING (
    public.can_access_case(auth.uid(), parent_case_id) OR public.can_access_case(auth.uid(), child_case_id));
CREATE POLICY "Write relationships for editable cases" ON public.case_relationships
  FOR INSERT TO authenticated WITH CHECK (
    public.can_write_case(auth.uid(), parent_case_id) AND public.can_write_case(auth.uid(), child_case_id));
CREATE POLICY "Update relationships for editable cases" ON public.case_relationships
  FOR UPDATE TO authenticated USING (
    public.can_write_case(auth.uid(), parent_case_id) AND public.can_write_case(auth.uid(), child_case_id))
  WITH CHECK (
    public.can_write_case(auth.uid(), parent_case_id) AND public.can_write_case(auth.uid(), child_case_id));
CREATE POLICY "Delete relationships for editable cases" ON public.case_relationships
  FOR DELETE TO authenticated USING (
    public.can_write_case(auth.uid(), parent_case_id) AND public.can_write_case(auth.uid(), child_case_id));

-- case_attachments
DROP POLICY IF EXISTS "Access attachments for accessible cases" ON public.case_attachments;
CREATE POLICY "View attachments for accessible cases" ON public.case_attachments
  FOR SELECT TO authenticated USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Write attachments for editable cases" ON public.case_attachments
  FOR INSERT TO authenticated WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Update attachments for editable cases" ON public.case_attachments
  FOR UPDATE TO authenticated USING (public.can_write_case(auth.uid(), case_id))
  WITH CHECK (public.can_write_case(auth.uid(), case_id));
CREATE POLICY "Delete attachments for editable cases" ON public.case_attachments
  FOR DELETE TO authenticated USING (public.can_write_case(auth.uid(), case_id));
