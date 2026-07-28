
DROP POLICY IF EXISTS "Read microplan entries (scoped)" ON public.microplan_entries;

CREATE POLICY "Read microplan entries (scoped)"
ON public.microplan_entries
FOR SELECT
USING (
  is_owner_or_co_owner(auth.uid())
  OR is_admin(auth.uid())
  OR (created_by = auth.uid())
  OR (
    created_by IS NULL
    AND project_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.user_project_assignments upa
        WHERE upa.user_id = auth.uid()
          AND upa.project_id = microplan_entries.project_id
      )
      OR user_can_enter_microplan(auth.uid(), project_id, state)
      OR EXISTS (
        SELECT 1 FROM public.microplan_form_access mfa
        WHERE mfa.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.admin_page_access apa
        WHERE apa.user_id = auth.uid() AND apa.page_id = 'microplanning'
      )
    )
  )
  OR (
    created_by IS NOT NULL
    AND can_read_microplan_entry(auth.uid(), state, lga, ward, flhf_name, community_name, settlement_name, project_id)
    AND created_by = auth.uid()
  )
);
