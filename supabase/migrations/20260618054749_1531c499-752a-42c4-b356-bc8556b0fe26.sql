CREATE TABLE public.submission_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id uuid NOT NULL UNIQUE,
  form_id uuid,
  form_name text,
  project_id uuid,
  project_name text,
  collector_id uuid,
  collector_name text,
  collector_email text,
  submitted_at timestamptz,
  local_time text,
  anomaly_type text NOT NULL DEFAULT 'after_hours_submission',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_anomalies TO authenticated;
GRANT ALL ON public.submission_anomalies TO service_role;

ALTER TABLE public.submission_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage anomalies"
ON public.submission_anomalies FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Collectors view own anomalies"
ON public.submission_anomalies FOR SELECT
TO authenticated
USING (collector_id = auth.uid());

CREATE TRIGGER trg_submission_anomalies_updated
BEFORE UPDATE ON public.submission_anomalies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.detect_after_hours_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_local timestamp;
  v_minutes int;
  v_is_night boolean;
  v_form_name text;
  v_project_id uuid;
  v_project_name text;
  v_collector_name text;
  v_collector_email text;
  v_anomaly_id uuid;
  v_ts timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM 'sent' THEN
    RETURN NEW;
  END IF;

  -- Skip if already flagged
  IF EXISTS (SELECT 1 FROM public.submission_anomalies WHERE submission_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_ts := COALESCE(NEW.submitted_at, now());
  v_local := v_ts AT TIME ZONE 'Africa/Lagos';
  v_minutes := EXTRACT(HOUR FROM v_local) * 60 + EXTRACT(MINUTE FROM v_local);

  -- Night window: 6:59 PM (1139) to 6:59 AM (419) Nigerian time
  v_is_night := (v_minutes >= 1139) OR (v_minutes < 419);

  IF NOT v_is_night THEN
    RETURN NEW;
  END IF;

  SELECT f.name, f.project_id INTO v_form_name, v_project_id
  FROM public.forms f WHERE f.id = NEW.form_id;

  IF v_project_id IS NOT NULL THEN
    SELECT p.name INTO v_project_name FROM public.projects p WHERE p.id = v_project_id;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(COALESCE(pr.first_name,'') || ' ' || COALESCE(pr.last_name,'')), ''), pr.email, 'Unknown user'),
         pr.email
    INTO v_collector_name, v_collector_email
  FROM public.profiles pr WHERE pr.user_id = NEW.user_id;

  INSERT INTO public.submission_anomalies (
    submission_id, form_id, form_name, project_id, project_name,
    collector_id, collector_name, collector_email, submitted_at, local_time, anomaly_type, status
  ) VALUES (
    NEW.id, NEW.form_id, COALESCE(v_form_name, 'Form'), v_project_id, COALESCE(v_project_name, 'Unassigned project'),
    NEW.user_id, COALESCE(v_collector_name, 'Unknown user'), v_collector_email, v_ts,
    to_char(v_local, 'DD Mon YYYY, HH12:MI AM'), 'after_hours_submission', 'pending'
  )
  RETURNING id INTO v_anomaly_id;

  -- In-app notification to all admins
  INSERT INTO public.notifications (user_id, title, message, type, category, related_id)
  SELECT ur.user_id,
         '🌙 After-Hours Submission Flagged',
         COALESCE(v_collector_name, 'A user') || ' submitted "' || COALESCE(v_form_name, 'a form') ||
         '" at ' || to_char(v_local, 'HH12:MI AM') || ' (night hours). Please follow up to capture the reason.',
         'warning',
         'data_quality',
         v_anomaly_id
  FROM public.user_roles ur
  WHERE ur.role IN ('super_admin', 'systems_admin');

  -- Trigger follow-up email
  PERFORM net.http_post(
    url := 'https://vhuixgcjmrmfowzrulac.supabase.co/functions/v1/night-submission-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWl4Z2NqbXJtZm93enJ1bGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDEyNzksImV4cCI6MjA4Mjc3NzI3OX0.mKN7lvoLNdh7zZD8-m2O4qoUZ71tBmnXRzFR6fN0Uf0'
    ),
    body := jsonb_build_object('anomaly_id', v_anomaly_id)
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_detect_after_hours_submission
AFTER INSERT OR UPDATE OF status ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.detect_after_hours_submission();