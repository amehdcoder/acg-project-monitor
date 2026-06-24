-- Audit table for realtime / referral data access attempts
CREATE TABLE public.access_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  resource_type text NOT NULL,          -- 'realtime_channel' | 'patient_referral'
  resource_id text,                     -- topic name or referral id
  action text NOT NULL,                 -- 'subscribe' | 'read' | 'list' | 'update' ...
  decision text NOT NULL,               -- 'allowed' | 'denied'
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.access_audit_log TO authenticated;
GRANT ALL ON public.access_audit_log TO service_role;

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins/owners may read the audit trail. Inserts happen only through
-- SECURITY DEFINER functions below (no direct INSERT grant to clients).
CREATE POLICY "Admins can view access audit log"
ON public.access_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE INDEX idx_access_audit_log_created_at ON public.access_audit_log (created_at DESC);
CREATE INDEX idx_access_audit_log_user ON public.access_audit_log (user_id, created_at DESC);
CREATE INDEX idx_access_audit_log_resource ON public.access_audit_log (resource_type, decision, created_at DESC);

-- Internal logger (SECURITY DEFINER so clients never write directly)
CREATE OR REPLACE FUNCTION public.log_access_attempt(
  _resource_type text,
  _resource_id text,
  _action text,
  _decision text,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.access_audit_log
    (user_id, resource_type, resource_id, action, decision, reason, metadata)
  VALUES
    (auth.uid(), _resource_type, _resource_id, _action, _decision, _reason, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_access_attempt(text, text, text, text, text, jsonb) TO authenticated;

-- Authorization guard for realtime channel subscriptions.
-- Validates the topic id format + participant membership, logs the decision,
-- and returns whether the caller may subscribe.
CREATE OR REPLACE FUNCTION public.authorize_realtime_subscription(_topic text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_id text;
  v_allowed boolean := false;
  v_reason text;
BEGIN
  IF v_user IS NULL THEN
    PERFORM public.log_access_attempt('realtime_channel', _topic, 'subscribe', 'denied', 'unauthenticated');
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  IF _topic IS NULL OR length(_topic) = 0 OR length(_topic) > 200 THEN
    PERFORM public.log_access_attempt('realtime_channel', _topic, 'subscribe', 'denied', 'invalid_topic');
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_topic');
  END IF;

  -- Shared presence channel: any authenticated user.
  IF _topic = 'app-collaborator-presence' THEN
    v_allowed := true;
    v_reason := 'presence_authenticated';

  -- Proximity inbox: proximity-inbox-<owner_uid>
  ELSIF _topic LIKE 'proximity-inbox-%' THEN
    v_id := substring(_topic FROM 'proximity-inbox-(.*)$');
    IF v_id !~ v_uuid_re THEN
      v_reason := 'malformed_inbox_topic';
    ELSIF v_id = v_user::text THEN
      v_allowed := true;
      v_reason := 'inbox_owner';
    ELSE
      v_reason := 'not_inbox_owner';
    END IF;

  -- Proximity chat: proximity-chat-<conversation_uuid>
  ELSIF _topic LIKE 'proximity-chat-%' THEN
    v_id := substring(_topic FROM 'proximity-chat-(.*)$');
    IF v_id !~ v_uuid_re THEN
      v_reason := 'malformed_chat_topic';
    ELSIF EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = v_id::uuid
        AND (c.user_a = v_user OR c.user_b = v_user)
    ) THEN
      v_allowed := true;
      v_reason := 'conversation_participant';
    ELSE
      v_reason := 'not_conversation_participant';
    END IF;

  ELSE
    v_reason := 'unknown_topic';
  END IF;

  PERFORM public.log_access_attempt(
    'realtime_channel', _topic, 'subscribe',
    CASE WHEN v_allowed THEN 'allowed' ELSE 'denied' END,
    v_reason
  );

  RETURN jsonb_build_object('allowed', v_allowed, 'reason', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_realtime_subscription(text) TO authenticated;