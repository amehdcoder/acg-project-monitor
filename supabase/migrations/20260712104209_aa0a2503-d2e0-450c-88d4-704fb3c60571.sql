-- 1. Mesh signaling room isolation: replace the self-referential membership
-- check with directed-message scoping. A peer may only read broadcast
-- discovery messages (no addressee) or messages addressed to a peer id it
-- actually owns (i.e. a peer id it has itself sent from in the same room).
CREATE OR REPLACE FUNCTION public.can_read_mesh_signal(_room_id text, _to_peer text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- broadcast discovery messages (hello/bye) carry no sensitive payload
    _to_peer IS NULL
    -- directed messages are only readable by the auth user who owns the
    -- destination peer id in this room
    OR EXISTS (
      SELECT 1 FROM public.mesh_signaling s
      WHERE s.room_id = _room_id
        AND s.from_peer = _to_peer
        AND s.created_by = auth.uid()
    );
$function$;

DROP POLICY IF EXISTS "Peers read signaling in their rooms" ON public.mesh_signaling;
CREATE POLICY "Peers read signaling in their rooms"
ON public.mesh_signaling
FOR SELECT
USING (
  expires_at > now()
  AND (
    created_by = auth.uid()
    OR public.can_read_mesh_signal(room_id, to_peer)
  )
);

-- 2. Chat attachment uploads must land in the uploader's own folder.
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Dashboard data source configs (may contain connection details) should
-- only be readable by dashboard editors/admins, not every authenticated user.
DROP POLICY IF EXISTS "Authenticated can view data sources" ON public.dashboard_data_sources;
CREATE POLICY "Editors can view data sources"
ON public.dashboard_data_sources
FOR SELECT
TO authenticated
USING (public.can_edit_dashboards(auth.uid()));