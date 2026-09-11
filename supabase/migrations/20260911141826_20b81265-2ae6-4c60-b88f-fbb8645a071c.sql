-- Voice samples
DROP POLICY IF EXISTS "Admins and donor read voice samples" ON storage.objects;
CREATE POLICY "Admins and donor read voice samples" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'voice-samples' AND (((select auth.uid())::text = (storage.foldername(name))[1]) OR is_admin((select auth.uid())) OR is_owner((select auth.uid()))));

DROP POLICY IF EXISTS "Donors and owner delete voice samples" ON storage.objects;
CREATE POLICY "Donors and owner delete voice samples" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voice-samples' AND (((select auth.uid())::text = (storage.foldername(name))[1]) OR is_owner((select auth.uid()))));

DROP POLICY IF EXISTS "Donors upload own voice sample" ON storage.objects;
CREATE POLICY "Donors upload own voice sample" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-samples' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

-- CES captures
DROP POLICY IF EXISTS "Owner or admins view CES capture files" ON storage.objects;
CREATE POLICY "Owner or admins view CES capture files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ces-captures' AND (((select auth.uid())::text = (storage.foldername(name))[1]) OR is_admin((select auth.uid()))));

-- UPRP uploads
DROP POLICY IF EXISTS "Owner or admins view uprp uploads" ON storage.objects;
CREATE POLICY "Owner or admins view uprp uploads" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'uprp-uploads' AND (((select auth.uid())::text = (storage.foldername(name))[1]) OR is_admin((select auth.uid()))));

DROP POLICY IF EXISTS "uprp users delete own" ON storage.objects;
CREATE POLICY "uprp users delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'uprp-uploads' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "uprp users update own" ON storage.objects;
CREATE POLICY "uprp users update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'uprp-uploads' AND ((select auth.uid())::text = (storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'uprp-uploads' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "uprp users upload own" ON storage.objects;
CREATE POLICY "uprp users upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'uprp-uploads' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

-- Avatars: require authentication for API reads and scope writes to authenticated owners
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images readable by authenticated users" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND ((select auth.uid())::text = (storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'avatars' AND ((select auth.uid())::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND ((select auth.uid())::text = (storage.foldername(name))[1]));