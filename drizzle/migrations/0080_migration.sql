CREATE OR REPLACE FUNCTION public.trg_emit_form_submission_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF NEW.status = 'draft' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.data IS NOT DISTINCT FROM OLD.data AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT project_id INTO pid FROM public.forms WHERE id = NEW.form_id;
  IF pid IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.webhook_endpoints e WHERE e.project_id = pid AND e.is_active
             AND ('form.submitted' = ANY(e.events) OR '*' = ANY(e.events))) THEN
    PERFORM public.emit_webhook_event(pid, 'form.submitted', jsonb_build_object(
      'form_id', NEW.form_id, 'submission_id', NEW.id, 'submitted_at', NEW.submitted_at,
      'operation', lower(TG_OP)));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_emit_form_submission_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emit_form_submission_event ON public.form_submissions;
CREATE TRIGGER emit_form_submission_event AFTER INSERT OR UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.trg_emit_form_submission_event();