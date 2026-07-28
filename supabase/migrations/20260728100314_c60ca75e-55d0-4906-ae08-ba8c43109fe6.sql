CREATE OR REPLACE FUNCTION public.can_read_mesh_signal(_room_id text, _to_peer text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Broadcast messages (hello/bye) are readable only by users who are
    -- themselves participants in this room (i.e. have posted their own peer
    -- record). This prevents unrelated authenticated users from enumerating
    -- room_id / from_peer identifiers.
    (
      _to_peer IS NULL
      AND EXISTS (
        SELECT 1 FROM public.mesh_signaling s
        WHERE s.room_id = _room_id
          AND s.created_by = auth.uid()
      )
    )
    -- Directed messages are only readable by the auth user who owns the
    -- destination peer id in this room.
    OR EXISTS (
      SELECT 1 FROM public.mesh_signaling s
      WHERE s.room_id = _room_id
        AND s.from_peer = _to_peer
        AND s.created_by = auth.uid()
    );
$function$;