CREATE POLICY "Users manage own seeclear evidence"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'seeclear-evidence' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'seeclear-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owner/admin read all seeclear evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'seeclear-evidence' AND (is_owner_or_co_owner(auth.uid()) OR is_admin(auth.uid())));