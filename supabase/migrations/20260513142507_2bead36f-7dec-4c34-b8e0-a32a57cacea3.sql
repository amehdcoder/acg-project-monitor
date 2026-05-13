ALTER TABLE public.ces_surveys
  ADD COLUMN IF NOT EXISTS feature_buildings_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_roads_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_waterways_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_uncertain_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_labeled_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_named_roads_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS est_hh_rooftop_source text DEFAULT 'detected_rooftops';

CREATE TABLE IF NOT EXISTS public.ces_feature_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.ces_surveys(id) ON DELETE CASCADE,
  feature_id text NOT NULL,
  feature_type text NOT NULL CHECK (feature_type IN ('building', 'road', 'waterway')),
  original_label text NOT NULL,
  corrected_label text NOT NULL,
  confidence numeric,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, feature_id, created_by)
);

ALTER TABLE public.ces_feature_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CES feature labels: survey viewers can view"
  ON public.ces_feature_labels
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id));

CREATE POLICY "CES feature labels: survey creator or admin create"
  ON public.ces_feature_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.ces_surveys s
      WHERE s.id = survey_id
        AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "CES feature labels: creator or admin edit"
  ON public.ces_feature_labels
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "CES feature labels: creator or admin delete"
  ON public.ces_feature_labels
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS ces_feature_labels_survey_idx ON public.ces_feature_labels(survey_id);
CREATE INDEX IF NOT EXISTS ces_feature_labels_type_idx ON public.ces_feature_labels(feature_type);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS ces_feature_labels_set_updated_at ON public.ces_feature_labels;
    CREATE TRIGGER ces_feature_labels_set_updated_at
      BEFORE UPDATE ON public.ces_feature_labels
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;