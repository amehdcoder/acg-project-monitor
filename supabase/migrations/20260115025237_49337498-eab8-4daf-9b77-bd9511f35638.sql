-- Drop ALL problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Members can view group members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Admins can manage all chat group members" ON public.chat_group_members;
DROP POLICY IF EXISTS "Members can view their chat groups" ON public.chat_groups;

-- Create security definer function to check if user is member of project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_can_access_chat_group(_user_id uuid, _chat_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members
    WHERE user_id = _user_id
      AND chat_group_id = _chat_group_id
  ) OR public.is_admin(_user_id)
$$;

-- Recreate chat_groups SELECT policy using security definer
CREATE POLICY "Members can view their chat groups"
ON public.chat_groups
FOR SELECT
USING (
  public.user_can_access_chat_group(auth.uid(), id)
);

-- Keep existing chat_group_members policies but ensure no self-referencing
-- The "Members can view their groups" policy is already correct (uses user_id = auth.uid())
-- No need to add another SELECT policy