-- standard_form_disabled
DROP POLICY IF EXISTS "Any signed-in user can read disabled standard forms" ON public.standard_form_disabled;
CREATE POLICY "Project members read disabled standard forms"
ON public.standard_form_disabled FOR SELECT TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR public.is_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = (SELECT auth.uid())
  )
);

-- custom_banks
DROP POLICY IF EXISTS "Authenticated users can view custom banks" ON public.custom_banks;
CREATE POLICY "Project members view custom banks"
ON public.custom_banks FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
  OR public.is_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = (SELECT auth.uid())
  )
);

-- mda_checklist_copy_hidden
DROP POLICY IF EXISTS "Anyone authenticated can read copy-hidden flags" ON public.mda_checklist_copy_hidden;
CREATE POLICY "Project members read copy-hidden flags"
ON public.mda_checklist_copy_hidden FOR SELECT TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR public.is_owner_or_co_owner((SELECT auth.uid()))
  OR project_id = ANY (public.accessible_project_ids((SELECT auth.uid())))
);

-- mda_tile_icons
DROP POLICY IF EXISTS "Authenticated users can read mda tile icons" ON public.mda_tile_icons;
CREATE POLICY "Form-scoped read of mda tile icons"
ON public.mda_tile_icons FOR SELECT TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR public.is_owner_level((SELECT auth.uid()))
  OR form_id = ANY (public.accessible_form_ids((SELECT auth.uid())))
);

-- storage: avatars
DROP POLICY IF EXISTS "Avatar images readable by authenticated users" ON storage.objects;
CREATE POLICY "Avatar images readable by owner or when in use"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    owner_id = (SELECT auth.uid())::text
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_url LIKE '%' || objects.name
    )
  )
);