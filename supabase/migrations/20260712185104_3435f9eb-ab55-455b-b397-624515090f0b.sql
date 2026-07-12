-- Re-assert topic-scoped, deny-by-default RLS on realtime.messages.
-- Only affects PRIVATE realtime channels (config: { private: true }).

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Topic-scoped realtime read" ON realtime.messages;
DROP POLICY IF EXISTS "Topic-scoped realtime write" ON realtime.messages;

CREATE POLICY "Topic-scoped realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    -- Direct/proximity chat: only the two conversation participants
    WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    -- Personal inbox: only the owning user
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
      realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
    -- App-wide collaborator presence: any signed-in user (intentional)
    WHEN realtime.topic() = 'app-collaborator-presence' THEN
      auth.uid() IS NOT NULL
    -- Deny every other private topic by default
    ELSE false
  END
);

CREATE POLICY "Topic-scoped realtime write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
      realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
    WHEN realtime.topic() = 'app-collaborator-presence' THEN
      auth.uid() IS NOT NULL
    ELSE false
  END
);