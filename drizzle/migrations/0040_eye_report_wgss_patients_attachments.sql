ALTER TABLE public.eye_daily_reports ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.eye_daily_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.eye_daily_reports(id) ON DELETE SET NULL,
  facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL,
  facility_name text NOT NULL,
  state text,
  lga text,
  report_date date NOT NULL,
  patient_label text NOT NULL,
  sex text,
  age_band text,
  wg_ss jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_disability boolean NOT NULL DEFAULT false,
  disability_domains text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  device_id uuid,
  collector_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eye_daily_patients_project_date ON public.eye_daily_patients (project_id, report_date);
CREATE INDEX eye_daily_patients_report ON public.eye_daily_patients (report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eye_daily_patients TO authenticated;
GRANT ALL ON public.eye_daily_patients TO service_role;

ALTER TABLE public.eye_daily_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters and viewers read patients" ON public.eye_daily_patients FOR SELECT TO authenticated
  USING (public.can_view_eye_dashboard(auth.uid(), project_id) OR (created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id)));
CREATE POLICY "Reporters insert patients" ON public.eye_daily_patients FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id));
CREATE POLICY "Reporters edit own patients, admins edit all" ON public.eye_daily_patients FOR UPDATE TO authenticated
  USING ((created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id)) OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.can_eye_report(auth.uid(), project_id) OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
CREATE POLICY "Reporters delete own patients, admins delete all" ON public.eye_daily_patients FOR DELETE TO authenticated
  USING ((created_by = auth.uid() AND public.can_eye_report(auth.uid(), project_id)) OR public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.eye_daily_patients_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.report_date > (now() AT TIME ZONE 'Africa/Lagos')::date THEN
    RAISE EXCEPTION 'Screening date cannot be in the future';
  END IF;
  IF length(trim(NEW.facility_name)) = 0 THEN RAISE EXCEPTION 'Facility is required'; END IF;
  IF length(trim(NEW.patient_label)) = 0 THEN RAISE EXCEPTION 'Patient label is required'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.eye_daily_patients_validate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eye_daily_patients_validate BEFORE INSERT OR UPDATE ON public.eye_daily_patients
FOR EACH ROW EXECUTE FUNCTION public.eye_daily_patients_validate();