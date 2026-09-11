CREATE POLICY "Project members read beneficiary media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'beneficiary-media'
  AND public.is_project_member((SELECT auth.uid()), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "Project members upload beneficiary media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'beneficiary-media'
  AND owner = (SELECT auth.uid())
  AND public.is_project_member((SELECT auth.uid()), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "Project members update own beneficiary media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'beneficiary-media'
  AND owner = (SELECT auth.uid())
  AND public.is_project_member((SELECT auth.uid()), (split_part(name, '/', 1))::uuid)
)
WITH CHECK (
  bucket_id = 'beneficiary-media'
  AND owner = (SELECT auth.uid())
  AND public.is_project_member((SELECT auth.uid()), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "Project members delete own beneficiary media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'beneficiary-media'
  AND owner = (SELECT auth.uid())
  AND public.is_project_member((SELECT auth.uid()), (split_part(name, '/', 1))::uuid)
);