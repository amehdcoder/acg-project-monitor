-- 1) Function search_path hardening
CREATE OR REPLACE FUNCTION public.mesh_room_project(_room_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN split_part(COALESCE(_room_id, ''), ':', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_room_id, ':', 1)::uuid
    ELSE NULL
  END;
$function$;

-- 2) Quiz archives: keep admin-only, fail closed on every path
REVOKE ALL ON public.quiz_archived_attempts FROM anon;
REVOKE UPDATE ON public.quiz_archived_attempts FROM authenticated;
ALTER TABLE public.quiz_archived_attempts FORCE ROW LEVEL SECURITY;

-- 3) Project-scoped realtime presence
CREATE OR REPLACE FUNCTION public.presence_topic_project(_topic text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _topic ~* '^presence:project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN substring(_topic from 18)::uuid
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_presence_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _pid uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  _pid := public.presence_topic_project(_topic);
  IF _pid IS NOT NULL THEN
    RETURN public.is_admin(_uid) OR public.is_project_member(_uid, _pid);
  END IF;

  -- Collaborators with no active project assignment announce themselves on a
  -- dedicated topic that only they and admins can observe.
  IF _topic = 'presence:project:none' THEN
    RETURN public.is_admin(_uid)
       OR NOT EXISTS (
            SELECT 1 FROM public.user_project_assignments upa
            WHERE upa.user_id = _uid
              AND public.is_assignment_active(upa.starts_at, upa.expires_at)
          );
  END IF;

  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS "Topic-scoped realtime read" ON realtime.messages;
DROP POLICY IF EXISTS "Topic-scoped realtime write" ON realtime.messages;

CREATE POLICY "Topic-scoped realtime read"
ON realtime.messages FOR SELECT TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'presence:project:%' THEN public.can_access_presence_topic(realtime.topic())
    ELSE false
  END
);

CREATE POLICY "Topic-scoped realtime write"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'presence:project:%' THEN public.can_access_presence_topic(realtime.topic())
    ELSE false
  END
);

GRANT EXECUTE ON FUNCTION public.presence_topic_project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_presence_topic(text) TO authenticated;