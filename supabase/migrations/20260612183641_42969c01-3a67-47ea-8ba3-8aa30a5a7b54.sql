ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE POLICY "Group admins can update messages in their groups"
ON public.chat_messages
FOR UPDATE
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM chat_group_members cgm
    WHERE cgm.chat_group_id = chat_messages.chat_group_id
      AND cgm.user_id = auth.uid()
      AND cgm.role = 'admin'
  )
)
WITH CHECK (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM chat_group_members cgm
    WHERE cgm.chat_group_id = chat_messages.chat_group_id
      AND cgm.user_id = auth.uid()
      AND cgm.role = 'admin'
  )
);