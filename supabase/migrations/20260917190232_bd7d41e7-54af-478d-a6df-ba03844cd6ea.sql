-- Pick the water point serving a place, village first then ward.
CREATE OR REPLACE FUNCTION public.match_wash_source(
  _project_id uuid, _village text, _ward text
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id FROM public.community_wash_sources w
   WHERE w.project_id = _project_id
     AND (
       (NULLIF(btrim(COALESCE(_village, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(w.village, ''))) = lower(btrim(_village)))
       OR (NULLIF(btrim(COALESCE(_ward, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(w.ward, ''))) = lower(btrim(_ward)))
     )
   ORDER BY
     CASE WHEN lower(btrim(COALESCE(w.village, ''))) = lower(btrim(COALESCE(_village, ''))) THEN 0 ELSE 1 END,
     w.is_improved DESC,
     w.name
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.match_wash_source(uuid, text, text) FROM PUBLIC, anon;

-- Households get their water point the moment they are created or placed.
CREATE OR REPLACE FUNCTION public.link_household_wash_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.wash_source_id IS NULL THEN
    NEW.wash_source_id := public.match_wash_source(NEW.project_id, NEW.village, NEW.ward);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_household_wash_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS households_link_wash_source ON public.beneficiary_households;
CREATE TRIGGER households_link_wash_source
  BEFORE INSERT OR UPDATE OF village, ward ON public.beneficiary_households
  FOR EACH ROW EXECUTE FUNCTION public.link_household_wash_source();

-- A newly registered water point adopts the households that have none.
CREATE OR REPLACE FUNCTION public.adopt_households_to_wash_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beneficiary_households h
     SET wash_source_id = NEW.id
   WHERE h.project_id = NEW.project_id
     AND h.wash_source_id IS NULL
     AND (
       (NULLIF(btrim(COALESCE(NEW.village, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(h.village, ''))) = lower(btrim(NEW.village)))
       OR (NULLIF(btrim(COALESCE(NEW.ward, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(h.ward, ''))) = lower(btrim(NEW.ward)))
     );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adopt_households_to_wash_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wash_sources_adopt_households ON public.community_wash_sources;
CREATE TRIGGER wash_sources_adopt_households
  AFTER INSERT OR UPDATE OF village, ward ON public.community_wash_sources
  FOR EACH ROW EXECUTE FUNCTION public.adopt_households_to_wash_source();

-- Link the households that already exist.
UPDATE public.beneficiary_households h
   SET wash_source_id = public.match_wash_source(h.project_id, h.village, h.ward)
 WHERE h.wash_source_id IS NULL;
