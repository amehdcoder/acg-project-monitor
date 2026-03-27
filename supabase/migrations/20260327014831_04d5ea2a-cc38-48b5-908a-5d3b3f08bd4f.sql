-- Allow all authenticated users to read simulation files from the public bucket
CREATE POLICY "All authenticated users can view public simulation files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vr-simulations');

-- Drop the overly restrictive admin-only policy since the bucket is public
DROP POLICY IF EXISTS "Admins can view simulation files" ON storage.objects;
-- Drop the granted-users-only policy since all auth users should see public bucket content
DROP POLICY IF EXISTS "Granted users can view simulation files" ON storage.objects;