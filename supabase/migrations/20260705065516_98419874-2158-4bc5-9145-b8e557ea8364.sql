CREATE POLICY "SARMAAN project members can view ACSM checklist forms"
ON public.forms
FOR SELECT
TO authenticated
USING (
  settings ->> 'sarmaan_acsm' = 'true'
  AND EXISTS (
    SELECT 1
    FROM public.user_project_assignments upa
    WHERE upa.project_id = forms.project_id
      AND upa.user_id = auth.uid()
  )
);