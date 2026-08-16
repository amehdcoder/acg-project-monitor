-- 1) Case notes: "team" visibility now means the case circle, not the whole project
CREATE OR REPLACE FUNCTION public.is_case_team_member(_user_id uuid, _case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id
      AND (c.owner_id = _user_id OR c.opened_by = _user_id OR c.last_modified_by = _user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.case_permissions cp
    WHERE cp.case_id = _case_id AND cp.shared_with_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_case_note(_case_id uuid, _author_id uuid, _visibility text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.can_access_case(auth.uid(), _case_id)
    AND (
      _author_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR (
        COALESCE(_visibility, 'team') IN ('project', 'public')
      )
      OR (
        COALESCE(_visibility, 'team') = 'team'
        AND public.is_case_team_member(auth.uid(), _case_id)
      )
    );
$$;

DROP POLICY IF EXISTS "Read case notes respecting visibility" ON public.case_notes;
CREATE POLICY "Read case notes respecting visibility"
ON public.case_notes
FOR SELECT
TO authenticated
USING (public.can_read_case_note(case_id, author_id, visibility));

-- 2) Mesh signaling: rooms are project-scoped and writes require verified participation
CREATE OR REPLACE FUNCTION public.mesh_room_project(_room_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(COALESCE(_room_id, ''), ':', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_room_id, ':', 1)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_join_mesh_room(_room_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.mesh_room_project(_room_id) IS NOT NULL
    AND (
      public.is_admin(auth.uid())
      OR public.is_project_member(auth.uid(), public.mesh_room_project(_room_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_mesh_signal(_room_id text, _from_peer text, _to_peer text, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.can_join_mesh_room(_room_id)
    AND _from_peer IS NOT NULL
    -- the peer identity must not already belong to somebody else
    AND NOT EXISTS (
      SELECT 1 FROM public.mesh_signaling s
      WHERE s.room_id = _room_id
        AND s.from_peer = _from_peer
        AND s.created_by <> auth.uid()
        AND s.expires_at > now()
    )
    -- only an announced participant may send handshake traffic
    AND (
      _kind = 'hello'
      OR EXISTS (
        SELECT 1 FROM public.mesh_signaling s
        WHERE s.room_id = _room_id
          AND s.from_peer = _from_peer
          AND s.created_by = auth.uid()
          AND s.kind = 'hello'
          AND s.expires_at > now()
      )
    )
    -- targeted signals may only address a peer actually present in the room
    AND (
      _to_peer IS NULL
      OR EXISTS (
        SELECT 1 FROM public.mesh_signaling s
        WHERE s.room_id = _room_id
          AND s.from_peer = _to_peer
          AND s.created_by <> auth.uid()
          AND s.expires_at > now()
      )
    );
$$;

DROP POLICY IF EXISTS "Authenticated write own signaling" ON public.mesh_signaling;
CREATE POLICY "Participants write signaling in their project rooms"
ON public.mesh_signaling
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_write_mesh_signal(room_id, from_peer, to_peer, kind)
);

DROP POLICY IF EXISTS "Peers read signaling in their rooms" ON public.mesh_signaling;
CREATE POLICY "Peers read signaling in their rooms"
ON public.mesh_signaling
FOR SELECT
TO authenticated
USING (
  expires_at > now()
  AND public.can_join_mesh_room(room_id)
  AND (created_by = auth.uid() OR public.can_read_mesh_signal(room_id, to_peer))
);