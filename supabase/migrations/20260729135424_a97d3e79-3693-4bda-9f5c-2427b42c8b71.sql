
DROP POLICY IF EXISTS "auth insert sessions" ON public.attendance_sessions;
CREATE POLICY "Members or admins insert sessions"
ON public.attendance_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id))
);

DROP POLICY IF EXISTS "auth insert records" ON public.attendance_records;
CREATE POLICY "Members or admins insert records"
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (
  marked_by = auth.uid()
  AND (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (s.created_by = auth.uid() OR is_project_member(auth.uid(), s.project_id))
    )
  )
);

DROP POLICY IF EXISTS "auth insert participants" ON public.attendance_participants;
CREATE POLICY "Members or admins insert participants"
ON public.attendance_participants
FOR INSERT
TO authenticated
WITH CHECK (
  registered_by = auth.uid()
  AND (
    is_admin(auth.uid())
    OR project_id IS NULL
    OR is_project_member(auth.uid(), project_id)
  )
);

DROP POLICY IF EXISTS "Admins can create case types" ON public.case_types;
CREATE POLICY "Admins can create case types in their projects"
ON public.case_types
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR project_id IN (
      SELECT upa.project_id FROM public.user_project_assignments upa
      WHERE upa.user_id = auth.uid()
    )
  )
);
