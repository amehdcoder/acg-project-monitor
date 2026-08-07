CREATE OR REPLACE FUNCTION public.mda_lens_geo_key(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(lower(btrim(split_part(COALESCE(_v, ''), '|', greatest(1, array_length(string_to_array(COALESCE(_v,''), '|'), 1))))),
      '^[a-z]+_[a-z0-9]+_|^[a-z]+__', '', 'g'),
    '\m(state|lga|ward)\M', '', 'g'),
  '[^a-z0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.mda_lens_allows_row(
  _user_id uuid,
  _project_id uuid,
  _state text,
  _lga text,
  _ward text,
  _campaign_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mda_lens_grants g
    WHERE g.user_id = _user_id
      AND g.enabled = true
      AND (
        COALESCE(cardinality(g.project_ids), 0) = 0
        OR _project_id = ANY(g.project_ids)
      )
      AND (
        COALESCE(cardinality(g.states), 0) = 0
        OR public.mda_lens_geo_key(_state) = ''
        OR EXISTS (
          SELECT 1 FROM unnest(g.states) allowed(value)
          WHERE public.mda_lens_geo_key(allowed.value) = public.mda_lens_geo_key(_state)
        )
      )
      AND (
        COALESCE(cardinality(g.lgas), 0) = 0
        OR public.mda_lens_geo_key(_lga) = ''
        OR EXISTS (
          SELECT 1 FROM unnest(g.lgas) allowed(value)
          WHERE public.mda_lens_geo_key(allowed.value) = public.mda_lens_geo_key(_lga)
        )
      )
      AND (
        COALESCE(cardinality(g.wards), 0) = 0
        OR public.mda_lens_geo_key(_ward) = ''
        OR EXISTS (
          SELECT 1 FROM unnest(g.wards) allowed(value)
          WHERE public.mda_lens_geo_key(allowed.value) = public.mda_lens_geo_key(_ward)
        )
      )
      AND (
        COALESCE(cardinality(g.campaign_types), 0) = 0
        OR NULLIF(btrim(COALESCE(_campaign_type, '')), '') IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(g.campaign_types) allowed(value)
          WHERE lower(btrim(allowed.value)) = lower(btrim(_campaign_type))
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.mda_lens_geo_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mda_lens_geo_key(text) TO authenticated, service_role;
