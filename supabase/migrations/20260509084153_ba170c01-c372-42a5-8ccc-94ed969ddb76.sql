
-- 1. Make vr-simulations bucket private
UPDATE storage.buckets SET public = false WHERE id = 'vr-simulations';

-- Replace overly-permissive SELECT policy
DROP POLICY IF EXISTS "All authenticated users can view public simulation files" ON storage.objects;

CREATE POLICY "VR sim files: admins, owners, or granted users only"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vr-simulations'
  AND (
    public.is_admin(auth.uid())
    OR public.is_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.vr_simulation_access vsa
      WHERE vsa.user_id = auth.uid()
        AND vsa.simulation_id::text = (storage.foldername(name))[1]
    )
  )
);

-- 2. Realtime authorization: require authenticated users for channel messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can send realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
