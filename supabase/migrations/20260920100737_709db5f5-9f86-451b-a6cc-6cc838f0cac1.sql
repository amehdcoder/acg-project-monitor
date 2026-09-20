ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS records_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_project_records_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.records_only IS DISTINCT FROM OLD.records_only THEN
    IF NOT public.is_owner_or_co_owner(auth.uid()) THEN
      RAISE EXCEPTION 'Only the Owner or a Co-Owner can change the beneficiary-records-only setting';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND COALESCE(NEW.records_only, false) = true THEN
    IF NOT public.is_owner_or_co_owner(auth.uid()) THEN
      NEW.records_only := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_records_only_trg ON public.projects;
CREATE TRIGGER guard_project_records_only_trg
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_records_only();