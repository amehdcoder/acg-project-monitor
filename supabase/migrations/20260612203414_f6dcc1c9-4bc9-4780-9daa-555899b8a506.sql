
ALTER TABLE public.proximity_messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

-- Helper: is the current user a participant in the conversation that owns a direct message?
CREATE OR REPLACE FUNCTION public.is_proximity_message_participant(_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proximity_messages pm
    WHERE pm.id = _message_id
      AND (pm.sender_id = auth.uid() OR pm.recipient_id = auth.uid())
  )
$$;

-- ── Reactions ──
CREATE TABLE IF NOT EXISTS public.proximity_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.proximity_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_message_reactions TO authenticated;
GRANT ALL ON public.proximity_message_reactions TO service_role;
ALTER TABLE public.proximity_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view direct reactions" ON public.proximity_message_reactions
  FOR SELECT TO authenticated USING (public.is_proximity_message_participant(message_id));
CREATE POLICY "Participants add own direct reactions" ON public.proximity_message_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_proximity_message_participant(message_id));
CREATE POLICY "Participants remove own direct reactions" ON public.proximity_message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Poll votes ──
CREATE TABLE IF NOT EXISTS public.proximity_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.proximity_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, option_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_poll_votes TO authenticated;
GRANT ALL ON public.proximity_poll_votes TO service_role;
ALTER TABLE public.proximity_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view direct poll votes" ON public.proximity_poll_votes
  FOR SELECT TO authenticated USING (public.is_proximity_message_participant(message_id));
CREATE POLICY "Participants cast own direct poll votes" ON public.proximity_poll_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_proximity_message_participant(message_id));
CREATE POLICY "Participants remove own direct poll votes" ON public.proximity_poll_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Event RSVPs ──
CREATE TABLE IF NOT EXISTS public.proximity_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.proximity_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_event_rsvps TO authenticated;
GRANT ALL ON public.proximity_event_rsvps TO service_role;
ALTER TABLE public.proximity_event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view direct event rsvps" ON public.proximity_event_rsvps
  FOR SELECT TO authenticated USING (public.is_proximity_message_participant(message_id));
CREATE POLICY "Participants manage own direct event rsvps" ON public.proximity_event_rsvps
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.is_proximity_message_participant(message_id));
CREATE TRIGGER update_proximity_event_rsvps_updated_at
  BEFORE UPDATE ON public.proximity_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_event_rsvps;
