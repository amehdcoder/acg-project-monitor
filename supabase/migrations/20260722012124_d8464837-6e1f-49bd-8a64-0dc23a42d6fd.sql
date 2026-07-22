
-- Harden profiles self-update: enforce column immutability at the RLS layer
-- so privileged fields cannot be modified even if the anti-escalation trigger
-- is ever disabled or bypassed.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_admin(auth.uid())
    OR (
      designation IS NOT DISTINCT FROM (SELECT p.designation FROM public.profiles p WHERE p.user_id = auth.uid())
      AND approval_status IS NOT DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.user_id = auth.uid())
      AND COALESCE(is_co_owner, false) IS NOT DISTINCT FROM COALESCE((SELECT p.is_co_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false)
      AND COALESCE(is_owner, false)    IS NOT DISTINCT FROM COALESCE((SELECT p.is_owner    FROM public.profiles p WHERE p.user_id = auth.uid()), false)
    )
  )
);

-- Harden user_roles: add explicit WITH CHECK to the super_admin ALL policy so
-- inserted/updated rows must still pass the has_role gate (defense in depth
-- against any accidental change to the USING-only expression).
DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;

CREATE POLICY "Super admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
