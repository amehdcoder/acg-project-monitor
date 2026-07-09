
-- Allow members of a chat group to view all co-members (not just themselves).
-- Uses the existing SECURITY DEFINER is_chat_group_member() to avoid RLS recursion.
DROP POLICY IF EXISTS "Members can view their groups" ON public.chat_group_members;

CREATE POLICY "Members can view co-members"
ON public.chat_group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR public.is_chat_group_member(auth.uid(), chat_group_id)
);
