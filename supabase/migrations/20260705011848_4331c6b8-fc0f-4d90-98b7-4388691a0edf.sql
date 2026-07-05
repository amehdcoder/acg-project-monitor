CREATE TABLE public.sarmaan_acsm_archived_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_submission_id UUID NOT NULL,
  form_id UUID NOT NULL,
  submitted_by UUID,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_created_at TIMESTAMP WITH TIME ZONE,
  archived_by UUID NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sarmaan_acsm_archived_submissions TO authenticated;
GRANT ALL ON public.sarmaan_acsm_archived_submissions TO service_role;

ALTER TABLE public.sarmaan_acsm_archived_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view ACSM archives"
ON public.sarmaan_acsm_archived_submissions FOR SELECT
TO authenticated USING (is_owner(auth.uid()));

CREATE POLICY "Owner can insert ACSM archives"
ON public.sarmaan_acsm_archived_submissions FOR INSERT
TO authenticated WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Owner can delete ACSM archives"
ON public.sarmaan_acsm_archived_submissions FOR DELETE
TO authenticated USING (is_owner(auth.uid()));