-- 1. Prevent privilege escalation on profiles via the admin update policy
CREATE OR REPLACE FUNCTION public.profile_owner_flag(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_owner FROM public.profiles p WHERE p.user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.profile_co_owner_flag(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_co_owner FROM public.profiles p WHERE p.user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id AND p.is_owner = true
  );
$$;

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (
  is_admin(auth.uid())
  AND (
    public.is_platform_owner(auth.uid())
    OR (
      COALESCE(is_owner, false) = public.profile_owner_flag(user_id)
      AND COALESCE(is_co_owner, false) = public.profile_co_owner_flag(user_id)
    )
  )
);

-- 2. Mesh signaling: only live participants may read room broadcasts
CREATE OR REPLACE FUNCTION public.can_read_mesh_signal(_room_id text, _to_peer text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      _to_peer IS NULL
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mesh_signaling s
        WHERE s.room_id = _room_id
          AND s.created_by = auth.uid()
          AND s.from_peer IS NOT NULL
          AND s.expires_at > now()
      )
    )
    OR (
      _to_peer IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mesh_signaling s
        WHERE s.room_id = _room_id
          AND s.from_peer = _to_peer
          AND s.created_by = auth.uid()
          AND s.expires_at > now()
      )
    );
$$;

DROP POLICY IF EXISTS "Peers read signaling in their rooms" ON public.mesh_signaling;

CREATE POLICY "Peers read signaling in their rooms"
ON public.mesh_signaling
FOR SELECT
TO authenticated
USING (
  expires_at > now()
  AND (created_by = auth.uid() OR public.can_read_mesh_signal(room_id, to_peer))
);

REVOKE ALL ON public.mesh_signaling FROM anon;

-- 3. Dashboard shares: admin-only client access; recipients go through the edge function
REVOKE ALL ON public.dashboard_shares FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_shares TO authenticated;
GRANT ALL ON public.dashboard_shares TO service_role;