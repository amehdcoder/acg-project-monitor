
DROP POLICY IF EXISTS "Topic-scoped realtime read" ON realtime.messages;
DROP POLICY IF EXISTS "Topic-scoped realtime write" ON realtime.messages;

CREATE POLICY "Topic-scoped realtime read" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
        SELECT 1 FROM public.proximity_conversations c
        WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
          AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
      )
      WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
        realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
      WHEN realtime.topic() = 'app-collaborator-presence' THEN auth.uid() IS NOT NULL
      ELSE false
    END
  );

CREATE POLICY "Topic-scoped realtime write" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
        SELECT 1 FROM public.proximity_conversations c
        WHERE c.id = (NULLIF(substring(realtime.topic(), 'proximity-chat-(.*)'), ''))::uuid
          AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
      )
      WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
        realtime.topic() = ('proximity-inbox-' || auth.uid()::text)
      WHEN realtime.topic() = 'app-collaborator-presence' THEN auth.uid() IS NOT NULL
      ELSE false
    END
  );
