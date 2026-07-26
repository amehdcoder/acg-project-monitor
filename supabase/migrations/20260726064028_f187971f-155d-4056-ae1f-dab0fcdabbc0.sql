
DROP POLICY IF EXISTS "Form access users can insert microplan entries" ON public.microplan_entries;
CREATE POLICY "Form access users can insert microplan entries"
ON public.microplan_entries
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.microplan_form_access
    WHERE microplan_form_access.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Form access users can update microplan entries" ON public.microplan_entries;
CREATE POLICY "Form access users can update microplan entries"
ON public.microplan_entries
FOR UPDATE
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.microplan_form_access
    WHERE microplan_form_access.user_id = auth.uid()
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.microplan_form_access
    WHERE microplan_form_access.user_id = auth.uid()
  )
);
