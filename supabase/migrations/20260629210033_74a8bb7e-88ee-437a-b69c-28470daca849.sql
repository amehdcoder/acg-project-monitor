CREATE POLICY "IRF users can upload own evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'irf-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "IRF users can read own evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'irf-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "IRF users can update own evidence"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'irf-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "IRF users can delete own evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'irf-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);