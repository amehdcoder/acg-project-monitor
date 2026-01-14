-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for chat attachments bucket
CREATE POLICY "Anyone can view chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own chat attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add attachment columns to chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS attachment_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS attachment_type TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS attachment_name TEXT DEFAULT NULL;

-- Add mentions column to store mentioned user IDs
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS mentions TEXT[] DEFAULT '{}';

-- Add unique constraint for chat_group_members if not exists
ALTER TABLE public.chat_group_members
DROP CONSTRAINT IF EXISTS chat_group_members_unique_user_group;
ALTER TABLE public.chat_group_members
ADD CONSTRAINT chat_group_members_unique_user_group UNIQUE (chat_group_id, user_id);

-- Create view or function to count unread messages per group for a user
CREATE OR REPLACE FUNCTION public.get_unread_count(
  p_user_id UUID,
  p_chat_group_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count INTEGER;
  last_read_msg_id UUID;
BEGIN
  -- Get the last message the user has read in this group
  SELECT message_id INTO last_read_msg_id
  FROM message_read_receipts
  WHERE user_id = p_user_id
    AND message_id IN (SELECT id FROM chat_messages WHERE chat_group_id = p_chat_group_id)
  ORDER BY read_at DESC
  LIMIT 1;

  -- Count messages after the last read message
  IF last_read_msg_id IS NULL THEN
    -- User hasn't read any messages, count all messages not from this user
    SELECT COUNT(*) INTO unread_count
    FROM chat_messages
    WHERE chat_group_id = p_chat_group_id
      AND sender_id != p_user_id
      AND is_deleted = false;
  ELSE
    -- Count messages after the last read message
    SELECT COUNT(*) INTO unread_count
    FROM chat_messages
    WHERE chat_group_id = p_chat_group_id
      AND sender_id != p_user_id
      AND is_deleted = false
      AND created_at > (SELECT created_at FROM chat_messages WHERE id = last_read_msg_id);
  END IF;

  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Create function to get total unread for a project
CREATE OR REPLACE FUNCTION public.get_project_unread_count(
  p_user_id UUID,
  p_project_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_unread INTEGER := 0;
  group_record RECORD;
BEGIN
  FOR group_record IN 
    SELECT id FROM chat_groups WHERE project_id = p_project_id
  LOOP
    total_unread := total_unread + public.get_unread_count(p_user_id, group_record.id);
  END LOOP;
  
  RETURN total_unread;
END;
$$;