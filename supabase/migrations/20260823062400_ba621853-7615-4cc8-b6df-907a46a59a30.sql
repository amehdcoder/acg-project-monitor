DROP POLICY IF EXISTS "Admins and owners can update IRF reports in their project" ON public.irf_reports;
DROP POLICY IF EXISTS "Admins and IRF owners can update IRF reports" ON public.irf_reports;

CREATE POLICY "Admins and IRF owners can update IRF reports"
ON public.irf_reports
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()) OR is_owner_level(auth.uid()))
WITH CHECK (is_admin(auth.uid()) OR is_owner_level(auth.uid()));

DROP POLICY IF EXISTS "Owners can insert mda tile icons" ON public.mda_tile_icons;
DROP POLICY IF EXISTS "Owners can update mda tile icons" ON public.mda_tile_icons;
DROP POLICY IF EXISTS "Owners can delete mda tile icons" ON public.mda_tile_icons;
DROP POLICY IF EXISTS "Owner-level admins can insert mda tile icons" ON public.mda_tile_icons;
DROP POLICY IF EXISTS "Owner-level admins can update mda tile icons" ON public.mda_tile_icons;
DROP POLICY IF EXISTS "Owner-level admins can delete mda tile icons" ON public.mda_tile_icons;

CREATE POLICY "Owner-level admins can insert mda tile icons"
ON public.mda_tile_icons FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()) OR is_owner_level(auth.uid()));

CREATE POLICY "Owner-level admins can update mda tile icons"
ON public.mda_tile_icons FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR is_owner_level(auth.uid()))
WITH CHECK (is_admin(auth.uid()) OR is_owner_level(auth.uid()));

CREATE POLICY "Owner-level admins can delete mda tile icons"
ON public.mda_tile_icons FOR DELETE TO authenticated
USING (is_admin(auth.uid()) OR is_owner_level(auth.uid()));