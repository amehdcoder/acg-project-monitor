DROP POLICY IF EXISTS "Chat attachment access scoped to group members" ON storage.objects;
CREATE POLICY "Chat attachment access scoped to group members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM chat_messages m
      JOIN chat_group_members gm
        ON gm.chat_group_id = m.chat_group_id
       AND gm.user_id = auth.uid()
      WHERE m.attachment_url IS NOT NULL
        AND (
          split_part(m.attachment_url, '/chat-attachments/', 2) = objects.name
          OR m.attachment_url = objects.name
          OR m.attachment_url LIKE '%/' || objects.name
        )
    )
  )
);