CREATE POLICY "Authenticated read all bmz records" ON public.bmz_monitoring FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.bmz_drafts_are_submissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'draft' THEN NEW.status := 'sent'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.bmz_drafts_are_submissions() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bmz_drafts_are_submissions BEFORE INSERT OR UPDATE ON public.bmz_monitoring
FOR EACH ROW EXECUTE FUNCTION public.bmz_drafts_are_submissions();

UPDATE public.bmz_monitoring SET status = 'sent' WHERE status = 'draft';