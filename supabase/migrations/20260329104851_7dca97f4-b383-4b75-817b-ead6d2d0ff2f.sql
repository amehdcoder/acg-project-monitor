CREATE POLICY "Form access users can delete own microplan entries"
ON public.microplan_entries
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM microplan_form_access
    WHERE microplan_form_access.user_id = auth.uid()
  )
);