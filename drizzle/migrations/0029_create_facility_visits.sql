CREATE TABLE public.facility_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  duration_minutes integer,
  outcome text NOT NULL DEFAULT 'routine_monitoring',
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX facility_visits_facility_idx ON public.facility_visits (facility_id, visit_date DESC);
CREATE INDEX facility_visits_project_idx ON public.facility_visits (project_id, visit_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facility_visits TO authenticated;
GRANT ALL ON public.facility_visits TO service_role;

ALTER TABLE public.facility_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read facility visits"
ON public.facility_visits FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
  OR public.facility_access_level(facility_id) IS NOT NULL
);

CREATE POLICY "Record facility visits"
ON public.facility_visits FOR INSERT TO authenticated
WITH CHECK (
  recorded_by = auth.uid()
  AND (
    is_admin(auth.uid())
    OR is_project_member(auth.uid(), project_id)
    OR public.can_record_at_facility(auth.uid(), facility_id)
  )
);

CREATE POLICY "Update own or managed facility visits"
ON public.facility_visits FOR UPDATE TO authenticated
USING (
  recorded_by = auth.uid()
  OR is_admin(auth.uid())
  OR public.can_manage_at_facility(auth.uid(), facility_id)
);

CREATE POLICY "Delete facility visits"
ON public.facility_visits FOR DELETE TO authenticated
USING (
  is_admin(auth.uid())
  OR public.can_manage_at_facility(auth.uid(), facility_id)
);

CREATE OR REPLACE FUNCTION public.touch_facility_visits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER facility_visits_touch_updated_at
BEFORE UPDATE ON public.facility_visits
FOR EACH ROW EXECUTE FUNCTION public.touch_facility_visits_updated_at();