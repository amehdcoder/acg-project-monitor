
-- Standard assessment submissions: WG-SS (disability), GAD-7 (anxiety), PHQ-9 (depression)
CREATE TABLE public.standard_assessment_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_code TEXT NOT NULL CHECK (form_code IN ('wg_ss', 'gad_7', 'phq_9')),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  demographics JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  severity TEXT,
  disability_flags JSONB,
  location JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sas_user ON public.standard_assessment_submissions(user_id);
CREATE INDEX idx_sas_form ON public.standard_assessment_submissions(form_code);
CREATE INDEX idx_sas_project ON public.standard_assessment_submissions(project_id);
CREATE INDEX idx_sas_created ON public.standard_assessment_submissions(created_at DESC);

ALTER TABLE public.standard_assessment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own assessment submissions"
  ON public.standard_assessment_submissions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users create own assessment submissions"
  ON public.standard_assessment_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own assessment submissions"
  ON public.standard_assessment_submissions FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users delete own assessment submissions"
  ON public.standard_assessment_submissions FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_sas_updated_at
  BEFORE UPDATE ON public.standard_assessment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
