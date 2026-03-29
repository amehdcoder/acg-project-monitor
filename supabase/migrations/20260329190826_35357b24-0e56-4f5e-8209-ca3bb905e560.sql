CREATE POLICY "Microplan form access users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.microplan_form_access
    WHERE microplan_form_access.user_id = auth.uid()
  )
);