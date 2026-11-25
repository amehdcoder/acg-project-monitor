DROP POLICY IF EXISTS "Signed-in users read land features" ON public.land_features;
CREATE POLICY "Project members read land features" ON public.land_features FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_project_assignments a WHERE a.user_id = auth.uid()));
REVOKE SELECT ON public.land_features FROM authenticated;
GRANT SELECT (id, source_ref, source_kind, state, lga, name, feature, latitude, longitude, population, source_url, created_at, updated_at) ON public.land_features TO authenticated;
CREATE OR REPLACE FUNCTION public.catalogue_land_features_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
DROP FUNCTION public.catalogue_land_features_guard();