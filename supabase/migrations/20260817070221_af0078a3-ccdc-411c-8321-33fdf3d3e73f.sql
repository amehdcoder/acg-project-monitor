-- 1. attendance_participants: guarantee registrar is always recorded
ALTER TABLE public.attendance_participants
  ALTER COLUMN registered_by SET DEFAULT auth.uid();
ALTER TABLE public.attendance_participants
  ALTER COLUMN registered_by SET NOT NULL;

-- 2. chat attachments: strict path equality instead of LIKE matching
DROP POLICY IF EXISTS "Chat attachment access scoped to group members" ON storage.objects;
CREATE POLICY "Chat attachment access scoped to group members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.chat_messages m
      JOIN public.chat_group_members gm
        ON gm.chat_group_id = m.chat_group_id AND gm.user_id = auth.uid()
      WHERE m.attachment_url IS NOT NULL
        AND (
          m.attachment_url = objects.name
          OR split_part(m.attachment_url, '/chat-attachments/', 2) = objects.name
        )
    )
  )
);

-- 3. vr-simulations: bind uploads to an existing simulation folder
DROP POLICY IF EXISTS "Admins can upload simulations" ON storage.objects;
CREATE POLICY "Admins can upload simulations"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vr-simulations'
  AND public.is_admin(auth.uid())
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.vr_simulations s
    WHERE s.id = ((storage.foldername(name))[1])::uuid
  )
);

-- 4. realtime coverage drift audit (admin only)
CREATE OR REPLACE FUNCTION public.audit_realtime_rls_coverage()
RETURNS TABLE(table_name text, rls_enabled boolean, has_select_policy boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text,
         c.relrowsecurity,
         EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd IN ('r','*'))
  FROM pg_publication_tables pt
  JOIN pg_class c ON c.relname = pt.tablename AND c.relnamespace = 'public'::regnamespace
  WHERE pt.pubname = 'supabase_realtime'
    AND public.is_admin(auth.uid())
    AND (NOT c.relrowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd IN ('r','*')));
$$;
REVOKE ALL ON FUNCTION public.audit_realtime_rls_coverage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_realtime_rls_coverage() TO authenticated;