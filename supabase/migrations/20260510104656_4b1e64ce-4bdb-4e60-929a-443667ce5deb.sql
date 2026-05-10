
ALTER TABLE public.ces_surveys
  ADD COLUMN IF NOT EXISTS outside_microplan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outside_microplan_reason text;

CREATE TABLE IF NOT EXISTS public.ces_segment_resamples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.ces_surveys(id) ON DELETE CASCADE,
  segment_label text NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ces_segment_resamples_survey ON public.ces_segment_resamples(survey_id);

ALTER TABLE public.ces_segment_resamples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resamples: insert by survey owner"
  ON public.ces_segment_resamples FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND (s.created_by = auth.uid() OR public.is_admin(auth.uid())))
  );

CREATE POLICY "Resamples: select by survey owner or admin"
  ON public.ces_segment_resamples FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND (s.created_by = auth.uid() OR public.is_admin(auth.uid())))
  );

CREATE POLICY "Resamples: delete by admin"
  ON public.ces_segment_resamples FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
