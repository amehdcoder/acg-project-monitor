DROP POLICY IF EXISTS "Anyone can view custom banks" ON public.custom_banks;
CREATE POLICY "Authenticated users can view custom banks"
  ON public.custom_banks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read mda tile icons" ON public.mda_tile_icons;
CREATE POLICY "Authenticated users can read mda tile icons"
  ON public.mda_tile_icons
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.is_proximity_participant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proximity_presence
    WHERE user_id = _user_id AND enabled = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_proximity_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "Read enabled proximity presence" ON public.proximity_presence;
CREATE POLICY "Participants read enabled proximity presence"
  ON public.proximity_presence
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (enabled = true AND public.is_proximity_participant(auth.uid()))
  );