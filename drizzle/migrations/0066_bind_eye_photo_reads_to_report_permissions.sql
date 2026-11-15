ALTER POLICY "Read source documents through permitted eye reports"
ON storage.objects
TO authenticated
USING (
  bucket_id = 'beneficiary-media'
  AND (SELECT auth.uid()) IS NOT NULL
  AND split_part(name, '/', 2) = 'eye-reports'
  AND EXISTS (
    SELECT 1
    FROM public.eye_daily_reports r
    WHERE r.id::text = split_part(objects.name, '/', 3)
      AND r.project_id::text = split_part(objects.name, '/', 1)
      AND (
        public.can_view_eye_dashboard((SELECT auth.uid()), r.project_id)
        OR (
          r.created_by = (SELECT auth.uid())
          AND public.can_eye_report((SELECT auth.uid()), r.project_id)
        )
      )
  )
);
COMMENT ON POLICY "Read source documents through permitted eye reports" ON storage.objects IS
'Private report photos are shared through explicit caller-bound Eye Health permissions and report RLS, not storage uploader ownership; migrated photos can be uploaded by the service role.';