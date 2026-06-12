-- Per-user archive/delete flags for proximity (direct) conversations
ALTER TABLE public.proximity_conversations
  ADD COLUMN IF NOT EXISTS archived_by_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_by_b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by_b boolean NOT NULL DEFAULT false;

-- List the current user's direct conversations with the other party's name,
-- last message preview and unread count. Security definer so we can resolve
-- the other participant's display name even when they are no longer nearby.
CREATE OR REPLACE FUNCTION public.get_proximity_conversations()
RETURNS TABLE(
  conversation_id uuid,
  other_id uuid,
  other_name text,
  status text,
  archived boolean,
  last_message text,
  last_message_at timestamp with time zone,
  last_sender_id uuid,
  unread_count integer,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END AS other_id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''),
      p.email,
      pr.display_name,
      'User'
    ) AS other_name,
    c.status,
    CASE WHEN c.user_a = auth.uid() THEN c.archived_by_a ELSE c.archived_by_b END AS archived,
    lm.body,
    lm.created_at,
    lm.sender_id,
    COALESCE(uc.cnt, 0)::int,
    c.updated_at
  FROM public.proximity_conversations c
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
    FROM public.proximity_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.proximity_messages m
    WHERE m.conversation_id = c.id
      AND m.recipient_id = auth.uid()
      AND m.read_at IS NULL
  ) uc ON true
  LEFT JOIN public.profiles p
    ON p.user_id = (CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END)
  LEFT JOIN public.proximity_presence pr
    ON pr.user_id = (CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END)
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND NOT (CASE WHEN c.user_a = auth.uid() THEN c.deleted_by_a ELSE c.deleted_by_b END)
    AND lm.created_at IS NOT NULL
  ORDER BY COALESCE(lm.created_at, c.updated_at) DESC;
$$;

-- Per-user archive / unarchive / delete of a direct conversation.
CREATE OR REPLACE FUNCTION public.set_proximity_conversation_flag(_conversation_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_is_a boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (user_a = v_me) INTO v_is_a
  FROM public.proximity_conversations
  WHERE id = _conversation_id
    AND (user_a = v_me OR user_b = v_me);

  IF v_is_a IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF _action = 'archive' THEN
    IF v_is_a THEN UPDATE public.proximity_conversations SET archived_by_a = true WHERE id = _conversation_id;
    ELSE UPDATE public.proximity_conversations SET archived_by_b = true WHERE id = _conversation_id; END IF;
  ELSIF _action = 'unarchive' THEN
    IF v_is_a THEN UPDATE public.proximity_conversations SET archived_by_a = false WHERE id = _conversation_id;
    ELSE UPDATE public.proximity_conversations SET archived_by_b = false WHERE id = _conversation_id; END IF;
  ELSIF _action = 'delete' THEN
    IF v_is_a THEN UPDATE public.proximity_conversations SET deleted_by_a = true, archived_by_a = false WHERE id = _conversation_id;
    ELSE UPDATE public.proximity_conversations SET deleted_by_b = true, archived_by_b = false WHERE id = _conversation_id; END IF;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$$;