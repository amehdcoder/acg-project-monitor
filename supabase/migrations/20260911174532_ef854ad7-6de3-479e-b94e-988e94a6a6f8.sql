
ALTER TABLE public.facility_focal_persons
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'manage';

DO $$ BEGIN
  ALTER TABLE public.facility_focal_persons
    ADD CONSTRAINT facility_focal_persons_access_level_chk
    CHECK (access_level IN ('view','record','manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.enforce_two_focal_persons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NEW.is_active AND NEW.role = 'focal_person' THEN
    SELECT count(*) INTO n
    FROM public.facility_focal_persons
    WHERE facility_id = NEW.facility_id
      AND is_active
      AND role = 'focal_person'
      AND id <> NEW.id;
    IF n >= 2 THEN
      RAISE EXCEPTION 'A facility can have at most two active focal persons';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_two_focal_persons ON public.facility_focal_persons;
CREATE TRIGGER trg_enforce_two_focal_persons
BEFORE INSERT OR UPDATE ON public.facility_focal_persons
FOR EACH ROW EXECUTE FUNCTION public.enforce_two_focal_persons();

CREATE OR REPLACE FUNCTION public.facility_access_level(_facility_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT access_level
  FROM public.facility_focal_persons
  WHERE facility_id = _facility_id
    AND user_id = (SELECT auth.uid())
    AND is_active
  ORDER BY CASE access_level WHEN 'manage' THEN 1 WHEN 'record' THEN 2 ELSE 3 END
  LIMIT 1
$$;
