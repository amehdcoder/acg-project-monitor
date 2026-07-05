CREATE POLICY "Sarmaan grantees can view forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sarmaan_form_access sfa
    WHERE sfa.form_id = forms.id
      AND sfa.user_id = auth.uid()
  )
);