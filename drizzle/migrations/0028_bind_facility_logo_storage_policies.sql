DROP POLICY IF EXISTS "Public read facility logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload facility logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update facility logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete facility logos" ON storage.objects;

-- Read: signed-in members of the project that owns the logo (first folder = project id), or admins
CREATE POLICY "Project members read facility logos" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'facility-logos'
  AND (
    public.is_admin(auth.uid())
    OR ((storage.foldername(name))[1])::uuid = ANY (public.accessible_project_ids(auth.uid()))
  )
);

-- Upload: only into a project the caller can access, owned by the caller
CREATE POLICY "Project members upload facility logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'facility-logos'
  AND owner_id = (select auth.uid()::text)
  AND (
    public.is_admin(auth.uid())
    OR ((storage.foldername(name))[1])::uuid = ANY (public.accessible_project_ids(auth.uid()))
  )
);

-- Replace: only the original uploader or an admin
CREATE POLICY "Owners update facility logos" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'facility-logos'
  AND (public.is_admin(auth.uid()) OR owner_id = (select auth.uid()::text))
)
WITH CHECK (
  bucket_id = 'facility-logos'
  AND (public.is_admin(auth.uid()) OR owner_id = (select auth.uid()::text))
);

-- Delete: only the original uploader or an admin
CREATE POLICY "Owners delete facility logos" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'facility-logos'
  AND (public.is_admin(auth.uid()) OR owner_id = (select auth.uid()::text))
);