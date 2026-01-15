-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Members can view their groups" ON public.chat_group_members;
DROP POLICY IF EXISTS "Admins can manage group members" ON public.chat_group_members;

-- Create a security definer function to check group membership without recursion
CREATE OR REPLACE FUNCTION public.is_chat_group_member(_user_id uuid, _chat_group_id uuid)
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
  )
$$;

-- Create a security definer function to check if user is admin of a chat group
CREATE OR REPLACE FUNCTION public.is_chat_group_admin(_user_id uuid, _chat_group_id uuid)
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
      AND role = 'admin'
  )
$$;

-- Recreate policies using the security definer functions
CREATE POLICY "Members can view their groups"
ON public.chat_group_members
FOR SELECT
USING (
  user_id = auth.uid() OR 
  public.is_admin(auth.uid())
);

CREATE POLICY "Admins can insert group members"
ON public.chat_group_members
FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) OR
  public.is_chat_group_admin(auth.uid(), chat_group_id)
);

CREATE POLICY "Admins can update group members"
ON public.chat_group_members
FOR UPDATE
USING (
  public.is_admin(auth.uid()) OR
  public.is_chat_group_admin(auth.uid(), chat_group_id)
);

CREATE POLICY "Admins can delete group members"
ON public.chat_group_members
FOR DELETE
USING (
  public.is_admin(auth.uid()) OR
  public.is_chat_group_admin(auth.uid(), chat_group_id)
);