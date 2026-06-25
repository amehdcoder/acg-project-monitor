
CREATE TABLE public.mda_tile_icons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL,
  tile_key TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (form_id, tile_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mda_tile_icons TO authenticated;
GRANT SELECT ON public.mda_tile_icons TO anon;
GRANT ALL ON public.mda_tile_icons TO service_role;

ALTER TABLE public.mda_tile_icons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mda tile icons"
  ON public.mda_tile_icons FOR SELECT
  USING (true);

CREATE POLICY "Owners can insert mda tile icons"
  ON public.mda_tile_icons FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners can update mda tile icons"
  ON public.mda_tile_icons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners can delete mda tile icons"
  ON public.mda_tile_icons FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
