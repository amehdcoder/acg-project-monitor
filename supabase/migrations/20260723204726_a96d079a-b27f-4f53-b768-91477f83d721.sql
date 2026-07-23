
DROP POLICY IF EXISTS "Read attendance participants" ON public.attendance_participants;
CREATE POLICY "Read attendance participants"
ON public.attendance_participants
FOR SELECT
USING (registered_by = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Creator, project members or admins view action points" ON public.meeting_action_points;
CREATE POLICY "Creator, responsible or admins view action points"
ON public.meeting_action_points
FOR SELECT
USING (
  auth.uid() = created_by
  OR auth.uid() = responsible_user_id
  OR is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Creator, project members or admins update action points" ON public.meeting_action_points;
CREATE POLICY "Creator, responsible or admins update action points"
ON public.meeting_action_points
FOR UPDATE
USING (
  auth.uid() = created_by
  OR auth.uid() = responsible_user_id
  OR is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  OR auth.uid() = responsible_user_id
  OR is_admin(auth.uid())
);
