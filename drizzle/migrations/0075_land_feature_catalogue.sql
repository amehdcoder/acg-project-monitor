CREATE TABLE public.land_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref text NOT NULL UNIQUE,
  source_kind text NOT NULL CHECK (source_kind IN ('grid3','osm')),
  state text,
  lga text,
  name text NOT NULL,
  feature text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN 4 AND 14.5),
  longitude double precision NOT NULL CHECK (longitude BETWEEN 2.5 AND 15),
  population numeric,
  source_url text,
  first_seen_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX land_features_geo_idx ON public.land_features (latitude, longitude);
CREATE INDEX land_features_area_idx ON public.land_features (state, lga);
GRANT SELECT ON public.land_features TO authenticated;
GRANT ALL ON public.land_features TO service_role;
ALTER TABLE public.land_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read land features" ON public.land_features FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.catalogue_land_features(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 500 THEN RAISE EXCEPTION 'invalid_rows'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    CONTINUE WHEN (r->>'source_kind') NOT IN ('grid3','osm');
    CONTINUE WHEN (r->>'source_kind') = 'osm' AND coalesce(r->>'source_ref','') !~ '^osm:(node|way|relation)/[0-9]+$';
    CONTINUE WHEN (r->>'source_kind') = 'grid3' AND coalesce(r->>'source_ref','') !~ '^grid3:';
    CONTINUE WHEN (r->>'latitude') IS NULL OR (r->>'longitude') IS NULL
      OR (r->>'latitude')::float8 NOT BETWEEN 4 AND 14.5 OR (r->>'longitude')::float8 NOT BETWEEN 2.5 AND 15;
    INSERT INTO public.land_features (source_ref, source_kind, state, lga, name, feature, latitude, longitude, population, source_url, first_seen_by)
    VALUES (left(r->>'source_ref',300), r->>'source_kind', left(r->>'state',80), left(r->>'lga',80),
            left(coalesce(nullif(r->>'name',''),'Unnamed mapped feature'),200), left(coalesce(r->>'feature','unknown'),80),
            (r->>'latitude')::float8, (r->>'longitude')::float8,
            CASE WHEN (r->>'population') ~ '^[0-9]+(\.[0-9]+)?$' THEN (r->>'population')::numeric END,
            CASE WHEN (r->>'source_kind') = 'osm' THEN 'https://www.openstreetmap.org/' || substr(r->>'source_ref', 5) ELSE 'https://grid3.org' END,
            auth.uid())
    ON CONFLICT (source_ref) DO UPDATE SET name = EXCLUDED.name, feature = EXCLUDED.feature,
      latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, population = EXCLUDED.population,
      state = coalesce(EXCLUDED.state, land_features.state), lga = coalesce(EXCLUDED.lga, land_features.lga), updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.catalogue_land_features(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_land_features(jsonb) TO authenticated, service_role;