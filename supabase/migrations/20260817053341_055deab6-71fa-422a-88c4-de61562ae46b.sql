DROP POLICY IF EXISTS "Anyone authenticated can view forum posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Members can view forum posts" ON public.forum_posts;
CREATE POLICY "Members can view forum posts"
ON public.forum_posts FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.shares_project_with(auth.uid(), user_id)
);

DROP POLICY IF EXISTS "Anyone authenticated can view forum replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Members can view forum replies" ON public.forum_replies;
CREATE POLICY "Members can view forum replies"
ON public.forum_replies FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.shares_project_with(auth.uid(), user_id)
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (designation IS DISTINCT FROM (SELECT p.designation FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (approval_status IS DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (COALESCE(is_co_owner, false) IS DISTINCT FROM COALESCE((SELECT p.is_co_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false))
  AND NOT (COALESCE(is_owner, false) IS DISTINCT FROM COALESCE((SELECT p.is_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false))
  AND NOT (COALESCE(is_active, true) IS DISTINCT FROM COALESCE((SELECT p.is_active FROM public.profiles p WHERE p.user_id = auth.uid()), true))
);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  AND (user_id <> auth.uid() OR public.is_platform_owner(auth.uid()))
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND (user_id <> auth.uid() OR public.is_platform_owner(auth.uid()))
  AND (
    public.is_platform_owner(auth.uid())
    OR (
      COALESCE(is_owner, false) = public.profile_owner_flag(user_id)
      AND COALESCE(is_co_owner, false) = public.profile_co_owner_flag(user_id)
    )
  )
);