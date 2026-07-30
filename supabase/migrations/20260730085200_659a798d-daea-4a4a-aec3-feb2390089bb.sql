ALTER TABLE public.microplan_entries ALTER COLUMN flhf_name SET DEFAULT 'Unspecified FLHF';

UPDATE public.microplan_entries SET flhf_name = 'Unspecified FLHF' WHERE flhf_name IS NULL OR btrim(flhf_name) = '';

CREATE OR REPLACE FUNCTION public.microplan_entries_default_flhf()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.flhf_name IS NULL OR btrim(NEW.flhf_name) = '' THEN
    NEW.flhf_name := 'Unspecified FLHF';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_microplan_entries_default_flhf ON public.microplan_entries;
CREATE TRIGGER trg_microplan_entries_default_flhf
BEFORE INSERT OR UPDATE ON public.microplan_entries
FOR EACH ROW EXECUTE FUNCTION public.microplan_entries_default_flhf();

CREATE UNIQUE INDEX IF NOT EXISTS idx_microplan_entries_idempotency_unique
ON public.microplan_entries (idempotency_key, project_id);