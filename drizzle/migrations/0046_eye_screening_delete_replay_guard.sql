CREATE TABLE public.eye_deleted_screenings (id uuid PRIMARY KEY, project_id uuid NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.eye_deleted_screenings TO service_role;
ALTER TABLE public.eye_deleted_screenings ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.eye_screening_delete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.eye_deleted_screenings(id,project_id) VALUES (OLD.id,OLD.project_id) ON CONFLICT(id) DO NOTHING;
    RETURN OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM public.eye_deleted_screenings WHERE id=NEW.id) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.eye_screening_delete_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eye_screening_remember_delete AFTER DELETE ON public.eye_daily_patients FOR EACH ROW EXECUTE FUNCTION public.eye_screening_delete_guard();
CREATE TRIGGER eye_screening_reject_replay BEFORE INSERT OR UPDATE ON public.eye_daily_patients FOR EACH ROW EXECUTE FUNCTION public.eye_screening_delete_guard();