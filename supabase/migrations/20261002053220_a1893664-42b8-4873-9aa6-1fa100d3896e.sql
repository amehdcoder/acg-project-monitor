DROP POLICY IF EXISTS "Authenticated read all bmz records" ON public.bmz_monitoring;

CREATE POLICY "Assigned users read all bmz records"
ON public.bmz_monitoring
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_project_assignments upa
    JOIN bmz_project_assignments bpa ON bpa.project_id = upa.project_id
    WHERE upa.user_id = auth.uid()
  )
);