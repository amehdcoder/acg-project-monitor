CREATE OR REPLACE FUNCTION public.eye_stamp_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.eye_stamp_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS eye_reports_stamp_updated_at ON public.eye_daily_reports;
CREATE TRIGGER eye_reports_stamp_updated_at BEFORE INSERT OR UPDATE ON public.eye_daily_reports FOR EACH ROW EXECUTE FUNCTION public.eye_stamp_updated_at();
DROP TRIGGER IF EXISTS eye_patients_stamp_updated_at ON public.eye_daily_patients;
CREATE TRIGGER eye_patients_stamp_updated_at BEFORE INSERT OR UPDATE ON public.eye_daily_patients FOR EACH ROW EXECUTE FUNCTION public.eye_stamp_updated_at();