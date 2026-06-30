CREATE POLICY "Owner/admin read all irf evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'irf-evidence'
  AND (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()))
);