
ALTER TABLE public.bloomberg_local_form_audit
  ADD COLUMN IF NOT EXISTS drafts_screenshot_path text,
  ADD COLUMN IF NOT EXISTS ready_screenshot_path text,
  ADD COLUMN IF NOT EXISTS days_worked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz;

-- Storage policies for the private device-audit snapshots bucket.
-- Files are stored under "<user_id>/..." so ownership is the first path segment.

DROP POLICY IF EXISTS "Device audit: users upload own snapshots" ON storage.objects;
CREATE POLICY "Device audit: users upload own snapshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bloomberg-device-audit'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Device audit: users update own snapshots" ON storage.objects;
CREATE POLICY "Device audit: users update own snapshots"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'bloomberg-device-audit'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'bloomberg-device-audit'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Device audit: users view own snapshots" ON storage.objects;
CREATE POLICY "Device audit: users view own snapshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bloomberg-device-audit'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_owner(auth.uid())
    OR public.is_admin(auth.uid())
  )
);
