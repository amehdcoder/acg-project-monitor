CREATE TABLE public.eye_who_surveys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, created_by uuid NOT NULL DEFAULT auth.uid(),
 indicator text NOT NULL CHECK (indicator IN ('ecsc','erec','tt','tf','backlog')), state text NOT NULL CHECK (length(trim(state)) BETWEEN 1 AND 300), lga text NOT NULL CHECK (length(trim(lga)) BETWEEN 1 AND 300),
 date date NOT NULL, baseline_date date NOT NULL, value numeric NOT NULL, baseline numeric NOT NULL,
 numerator integer NOT NULL CHECK (numerator >= 0), denominator integer, baseline_numerator integer NOT NULL CHECK (baseline_numerator >= 0), baseline_denominator integer,
 source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 300), methodology text NOT NULL CHECK (length(trim(methodology)) BETWEEN 1 AND 300), representative boolean NOT NULL CHECK (representative),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id, indicator, state, lga, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eye_who_surveys TO authenticated;
GRANT ALL ON public.eye_who_surveys TO service_role;
ALTER TABLE public.eye_who_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read permitted survey evidence" ON public.eye_who_surveys FOR SELECT TO authenticated USING (public.can_view_eye_dashboard(auth.uid(),project_id) OR (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id)));
CREATE POLICY "Create own permitted surveys" ON public.eye_who_surveys FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE POLICY "Update own permitted surveys" ON public.eye_who_surveys FOR UPDATE TO authenticated USING (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id)) WITH CHECK (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE POLICY "Delete own permitted surveys" ON public.eye_who_surveys FOR DELETE TO authenticated USING (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE FUNCTION public.validate_eye_who_survey() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.date > current_date OR NEW.baseline_date > NEW.date THEN RAISE EXCEPTION 'Use valid non-future survey and baseline dates'; END IF;
 IF NEW.indicator IN ('ecsc','erec') AND extract(year FROM NEW.baseline_date) <> 2020 THEN RAISE EXCEPTION 'WHO coverage gains require a documented 2020 baseline'; END IF;
 IF NEW.indicator='backlog' THEN
  NEW.value := NEW.numerator; NEW.baseline := NEW.baseline_numerator;
  NEW.denominator := NULL; NEW.baseline_denominator := NULL;
 ELSE
  IF NEW.denominator IS NULL OR NEW.baseline_denominator IS NULL OR NEW.denominator <= 0 OR NEW.baseline_denominator <= 0 OR NEW.numerator > NEW.denominator OR NEW.baseline_numerator > NEW.baseline_denominator THEN RAISE EXCEPTION 'Survey counts require positive denominators and valid numerators'; END IF;
  NEW.value := NEW.numerator::numeric / NEW.denominator * 100; NEW.baseline := NEW.baseline_numerator::numeric / NEW.baseline_denominator * 100;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.created_by<>OLD.created_by) THEN RAISE EXCEPTION 'Survey ownership and project cannot change'; END IF;
 NEW.updated_at := now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_eye_who_survey() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_eye_who_survey BEFORE INSERT OR UPDATE ON public.eye_who_surveys FOR EACH ROW EXECUTE FUNCTION public.validate_eye_who_survey();
CREATE INDEX eye_who_surveys_project_updated ON public.eye_who_surveys(project_id,updated_at,id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.eye_who_surveys;