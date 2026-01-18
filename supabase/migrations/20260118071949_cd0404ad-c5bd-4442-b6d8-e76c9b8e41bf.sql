-- Create message_reactions table for emoji reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on message_reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
CREATE POLICY "Users can view reactions in their chat groups"
  ON public.message_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
      WHERE cm.id = message_id AND cgm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add reactions to messages in their chat groups"
  ON public.message_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
      WHERE cm.id = message_id AND cgm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON public.message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- Create typing_indicators table for tracking who is typing
CREATE TABLE public.typing_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chat_group_id, user_id)
);

-- Enable RLS on typing_indicators
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS policies for typing_indicators
CREATE POLICY "Users can view typing indicators in their chat groups"
  ON public.typing_indicators
  FOR SELECT
  USING (user_can_access_chat_group(chat_group_id, auth.uid()));

CREATE POLICY "Users can set their own typing indicator"
  ON public.typing_indicators
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_can_access_chat_group(chat_group_id, auth.uid()));

CREATE POLICY "Users can update their own typing indicator"
  ON public.typing_indicators
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their own typing indicator"
  ON public.typing_indicators
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for typing indicators
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Add index for performance
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_typing_indicators_group ON public.typing_indicators(chat_group_id);