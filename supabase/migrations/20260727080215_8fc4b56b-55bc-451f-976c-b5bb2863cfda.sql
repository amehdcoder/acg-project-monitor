
-- 1. Consolidate microplan_entries INSERT policies into one
DROP POLICY IF EXISTS "Field designations can insert microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Form access users can insert microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Granted admins can insert microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Project members can insert own microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Project-granted users can insert microplan entries" ON public.microplan_entries;

CREATE POLICY "Authorized users can insert microplan entries"
ON public.microplan_entries
FOR INSERT
TO authenticated
WITH CHECK (
  -- Admin path: granted admin_page_access for microplanning (no created_by pin)
  (
    EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = auth.uid() AND page_id = 'microplanning'
    )
  )
  OR
  -- All other paths require the row to be owned by the inserter
  (
    created_by = auth.uid()
    AND (
      public.has_field_designation(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.microplan_form_access
        WHERE user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_project_assignments upa
        WHERE upa.user_id = auth.uid()
          AND upa.project_id = microplan_entries.project_id
      )
      OR public.user_can_enter_microplan(auth.uid(), project_id, state)
    )
  )
);

-- 2. Harden profiles self-update: explicit block on privilege columns for non-admins
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_admin(auth.uid())
    OR (
      -- Standard users cannot change any privilege / approval / designation fields
      designation IS NOT DISTINCT FROM (SELECT p.designation FROM public.profiles p WHERE p.user_id = auth.uid())
      AND approval_status IS NOT DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.user_id = auth.uid())
      AND COALESCE(is_co_owner, false) IS NOT DISTINCT FROM COALESCE((SELECT p.is_co_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false)
      AND COALESCE(is_owner, false) IS NOT DISTINCT FROM COALESCE((SELECT p.is_owner FROM public.profiles p WHERE p.user_id = auth.uid()), false)
      AND COALESCE(is_active, true) IS NOT DISTINCT FROM COALESCE((SELECT p.is_active FROM public.profiles p WHERE p.user_id = auth.uid()), true)
    )
  )
);
