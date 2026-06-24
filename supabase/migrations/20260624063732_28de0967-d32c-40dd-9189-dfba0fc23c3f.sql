-- 1. mesh_signaling: restrict SELECT to the peers/creator of each signaling row
DROP POLICY IF EXISTS "Authenticated read recent signaling" ON public.mesh_signaling;
CREATE POLICY "Peers read own signaling"
ON public.mesh_signaling
FOR SELECT
TO authenticated
USING (
  expires_at > now()
  AND (
    auth.uid()::text = to_peer
    OR auth.uid()::text = from_peer
    OR created_by = auth.uid()
  )
);

-- 2. patient_referrals: restrict SELECT to involved clinicians, admins, or project-assigned users
DROP POLICY IF EXISTS "Authenticated can view referrals" ON public.patient_referrals;
CREATE POLICY "Involved parties can view referrals"
ON public.patient_referrals
FOR SELECT
TO authenticated
USING (
  auth.uid() = referred_by
  OR auth.uid() = accepted_by
  OR public.is_admin(auth.uid())
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_project_assignments upa
      WHERE upa.project_id = patient_referrals.project_id
        AND upa.user_id = auth.uid()
    )
  )
);

-- 3. realtime.messages: replace permissive (true) policies with topic-scoped ones
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy WHERE polrelid = 'realtime.messages'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', pol.polname);
  END LOOP;
END $$;

CREATE POLICY "Topic-scoped realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'proximity-chat-%' THEN EXISTS (
      SELECT 1 FROM public.proximity_conversations c
      WHERE c.id = NULLIF(substring(realtime.topic() FROM 'proximity-chat-(.*)'), '')::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
      realtime.topic() = 'proximity-inbox-' || auth.uid()::text
    ELSE auth.uid() IS NOT NULL
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
      WHERE c.id = NULLIF(substring(realtime.topic() FROM 'proximity-chat-(.*)'), '')::uuid
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    WHEN realtime.topic() LIKE 'proximity-inbox-%' THEN
      realtime.topic() = 'proximity-inbox-' || auth.uid()::text
    ELSE auth.uid() IS NOT NULL
  END
);