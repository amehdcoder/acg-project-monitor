-- ============================================================
-- Proximity ("nearby users") feature
-- ============================================================

-- 1. Live presence / location for opted-in users
CREATE TABLE public.proximity_presence (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_presence TO authenticated;
GRANT ALL ON public.proximity_presence TO service_role;

ALTER TABLE public.proximity_presence ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read presence rows that are enabled (needed to find peers)
CREATE POLICY "Read enabled proximity presence"
  ON public.proximity_presence FOR SELECT TO authenticated
  USING (enabled = true OR user_id = auth.uid());

CREATE POLICY "Upsert own proximity presence (insert)"
  ON public.proximity_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Upsert own proximity presence (update)"
  ON public.proximity_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own proximity presence"
  ON public.proximity_presence FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. Conversations between two nearby users
CREATE TABLE public.proximity_conversations (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  ended_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_conversations TO authenticated;
GRANT ALL ON public.proximity_conversations TO service_role;

ALTER TABLE public.proximity_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read conversations"
  ON public.proximity_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Participants update conversations"
  ON public.proximity_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- 3. Messages
CREATE TABLE public.proximity_messages (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.proximity_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proximity_messages TO authenticated;
GRANT ALL ON public.proximity_messages TO service_role;

ALTER TABLE public.proximity_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read messages"
  ON public.proximity_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Sender inserts messages"
  ON public.proximity_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipient marks read"
  ON public.proximity_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

-- updated_at triggers
CREATE TRIGGER trg_proximity_presence_updated
  BEFORE UPDATE ON public.proximity_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_proximity_conversations_updated
  BEFORE UPDATE ON public.proximity_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: get-or-create a conversation between current user and another user,
-- ordering the pair deterministically and re-activating an ended chat.
CREATE OR REPLACE FUNCTION public.start_proximity_conversation(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _other IS NULL OR _other = v_me THEN
    RAISE EXCEPTION 'Invalid conversation partner';
  END IF;

  IF v_me < _other THEN v_a := v_me; v_b := _other;
  ELSE v_a := _other; v_b := v_me; END IF;

  INSERT INTO public.proximity_conversations (user_a, user_b, status)
  VALUES (v_a, v_b, 'active')
  ON CONFLICT (user_a, user_b)
  DO UPDATE SET status = 'active', ended_by = NULL, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Realtime
ALTER TABLE public.proximity_presence REPLICA IDENTITY FULL;
ALTER TABLE public.proximity_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.proximity_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proximity_messages;