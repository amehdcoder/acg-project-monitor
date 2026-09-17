ALTER TABLE public.community_wash_sources
  ADD COLUMN IF NOT EXISTS functional_status text NOT NULL DEFAULT 'functional';

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
     AND COALESCE(w.functional_status, 'functional') IN ('functional', 'seasonal')
     AND (
       (NULLIF(btrim(COALESCE(_village, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(w.village, ''))) = lower(btrim(_village)))
       OR (NULLIF(btrim(COALESCE(_ward, '')), '') IS NOT NULL
         AND lower(btrim(COALESCE(w.ward, ''))) = lower(btrim(_ward)))
     )
   ORDER BY
     CASE WHEN lower(btrim(COALESCE(w.village, ''))) = lower(btrim(COALESCE(_village, ''))) THEN 0 ELSE 1 END,
     CASE WHEN COALESCE(w.functional_status, 'functional') = 'functional' THEN 0 ELSE 1 END,
     w.is_improved DESC,
     w.name
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.match_wash_source(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.adopt_households_to_wash_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A water point that stopped working releases the households it served.
  IF COALESCE(NEW.functional_status, 'functional') NOT IN ('functional', 'seasonal') THEN
    UPDATE public.beneficiary_households h
       SET wash_source_id = NULL
     WHERE h.wash_source_id = NEW.id;
    RETURN NEW;
  END IF;

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
  AFTER INSERT OR UPDATE OF village, ward, functional_status ON public.community_wash_sources
  FOR EACH ROW EXECUTE FUNCTION public.adopt_households_to_wash_source();

UPDATE public.beneficiary_households h
   SET wash_source_id = NULL
  FROM public.community_wash_sources w
 WHERE h.wash_source_id = w.id
   AND COALESCE(w.functional_status, 'functional') NOT IN ('functional', 'seasonal');