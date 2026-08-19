-- 1) Harden chat attachment writes: own-folder enforced on both source and target rows
DROP POLICY IF EXISTS "Users can update their own chat attachments" ON storage.objects;
CREATE POLICY "Users can update their own chat attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;
CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND owner = auth.uid()
);

-- 2) Stop broadcasting precise GPS rows over Realtime (no client subscribes to it)
ALTER PUBLICATION supabase_realtime DROP TABLE public.locations;