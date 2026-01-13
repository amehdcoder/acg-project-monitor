-- Create chat_groups table for project messaging
CREATE TABLE public.chat_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_default BOOLEAN NOT NULL DEFAULT false
);

-- Create chat_group_members table
CREATE TABLE public.chat_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  added_by UUID NOT NULL,
  UNIQUE(chat_group_id, user_id)
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message_read_receipts table
CREATE TABLE public.message_read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS on all chat tables
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_groups
CREATE POLICY "Admins can manage all chat groups"
ON public.chat_groups FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Members can view their chat groups"
ON public.chat_groups FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.chat_group_members 
  WHERE chat_group_members.chat_group_id = chat_groups.id 
  AND chat_group_members.user_id = auth.uid()
));

-- RLS Policies for chat_group_members
CREATE POLICY "Admins can manage all chat group members"
ON public.chat_group_members FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Members can view group members"
ON public.chat_group_members FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.chat_group_members cgm
  WHERE cgm.chat_group_id = chat_group_members.chat_group_id 
  AND cgm.user_id = auth.uid()
));

-- RLS Policies for chat_messages
CREATE POLICY "Admins can view all messages"
ON public.chat_messages FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Members can view messages in their groups"
ON public.chat_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.chat_group_members 
  WHERE chat_group_members.chat_group_id = chat_messages.chat_group_id 
  AND chat_group_members.user_id = auth.uid()
));

CREATE POLICY "Members can send messages to their groups"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.chat_group_members 
    WHERE chat_group_members.chat_group_id = chat_messages.chat_group_id 
    AND chat_group_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can edit their own messages"
ON public.chat_messages FOR UPDATE
USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages"
ON public.chat_messages FOR DELETE
USING (auth.uid() = sender_id OR is_admin(auth.uid()));

-- RLS Policies for message_read_receipts
CREATE POLICY "Users can manage their own read receipts"
ON public.message_read_receipts FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Members can view read receipts in their groups"
ON public.message_read_receipts FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.chat_messages cm
  JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
  WHERE cm.id = message_read_receipts.message_id 
  AND cgm.user_id = auth.uid()
));

-- Enable realtime for chat_messages
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- Create function to auto-create default chat group for new projects
CREATE OR REPLACE FUNCTION public.create_default_chat_group()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_groups (project_id, name, description, created_by, is_default)
  VALUES (NEW.id, NEW.name || ' General', 'Default chat group for ' || NEW.name, NEW.created_by, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create chat group on project creation
CREATE TRIGGER on_project_created_create_chat_group
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.create_default_chat_group();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for timestamp updates
CREATE TRIGGER update_chat_groups_updated_at
BEFORE UPDATE ON public.chat_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();

CREATE TRIGGER update_chat_messages_updated_at
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();