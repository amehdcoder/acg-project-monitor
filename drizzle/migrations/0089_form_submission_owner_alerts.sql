CREATE TABLE public.form_submission_email_alerts (
  submission_id uuid PRIMARY KEY,
  recipient text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.form_submission_email_alerts TO service_role;
ALTER TABLE public.form_submission_email_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_owner_form_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(NEW.status, '') = 'draft' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') <> 'draft' THEN RETURN NEW; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://vhuixgcjmrmfowzrulac.supabase.co/functions/v1/notify-form-submission',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWl4Z2NqbXJtZm93enJ1bGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDEyNzksImV4cCI6MjA4Mjc3NzI3OX0.mKN7lvoLNdh7zZD8-m2O4qoUZ71tBmnXRzFR6fN0Uf0'),
      body := jsonb_build_object('submission_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL; -- never block saving a submission
  END;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_owner_form_submission() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_owner_form_submission
AFTER INSERT OR UPDATE OF status ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_form_submission();