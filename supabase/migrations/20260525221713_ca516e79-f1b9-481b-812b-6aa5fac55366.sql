
CREATE TABLE IF NOT EXISTS public.office_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_code text NOT NULL CHECK (form_code IN ('srf','incident','leave','stationery')),
  reference_code text UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'submitted',
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_form_submissions_form_code_idx ON public.office_form_submissions(form_code);
CREATE INDEX IF NOT EXISTS office_form_submissions_submitted_by_idx ON public.office_form_submissions(submitted_by);

CREATE OR REPLACE FUNCTION public.set_office_form_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  n bigint;
BEGIN
  IF NEW.reference_code IS NULL THEN
    prefix := CASE NEW.form_code
      WHEN 'srf' THEN 'SRF'
      WHEN 'incident' THEN 'INC'
      WHEN 'leave' THEN 'LEV'
      WHEN 'stationery' THEN 'OFF'
      ELSE 'DOC'
    END;
    SELECT count(*)+1 INTO n FROM public.office_form_submissions WHERE form_code = NEW.form_code;
    NEW.reference_code := prefix || '-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 6, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS office_form_submissions_ref ON public.office_form_submissions;
CREATE TRIGGER office_form_submissions_ref
BEFORE INSERT OR UPDATE ON public.office_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_office_form_reference();

ALTER TABLE public.office_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own office submissions"
ON public.office_form_submissions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users view office submissions"
ON public.office_form_submissions FOR SELECT TO authenticated
USING (
  auth.uid() = submitted_by
  OR public.has_role(auth.uid(),'super_admin')
);

CREATE POLICY "Users update office submissions"
ON public.office_form_submissions FOR UPDATE TO authenticated
USING (
  auth.uid() = submitted_by
  OR public.has_role(auth.uid(),'super_admin')
);

CREATE POLICY "Admins delete office submissions"
ON public.office_form_submissions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'super_admin'));
