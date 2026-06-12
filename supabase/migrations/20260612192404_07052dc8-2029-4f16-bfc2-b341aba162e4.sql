
CREATE TABLE public.chat_poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, option_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_poll_votes TO authenticated;
GRANT ALL ON public.chat_poll_votes TO service_role;

ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view poll votes"
ON public.chat_poll_votes FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chat_messages cm
  JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
  WHERE cm.id = chat_poll_votes.message_id AND cgm.user_id = auth.uid()
));

CREATE POLICY "Members can cast their own poll votes"
ON public.chat_poll_votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.chat_messages cm
  JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
  WHERE cm.id = chat_poll_votes.message_id AND cgm.user_id = auth.uid()
));

CREATE POLICY "Members can remove their own poll votes"
ON public.chat_poll_votes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TABLE public.chat_event_rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_event_rsvps TO authenticated;
GRANT ALL ON public.chat_event_rsvps TO service_role;

ALTER TABLE public.chat_event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view event rsvps"
ON public.chat_event_rsvps FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chat_messages cm
  JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
  WHERE cm.id = chat_event_rsvps.message_id AND cgm.user_id = auth.uid()
));

CREATE POLICY "Members can manage their own event rsvps"
ON public.chat_event_rsvps FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.chat_messages cm
  JOIN public.chat_group_members cgm ON cgm.chat_group_id = cm.chat_group_id
  WHERE cm.id = chat_event_rsvps.message_id AND cgm.user_id = auth.uid()
));

CREATE TRIGGER update_chat_event_rsvps_updated_at
BEFORE UPDATE ON public.chat_event_rsvps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.chat_poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.chat_event_rsvps REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_event_rsvps;
