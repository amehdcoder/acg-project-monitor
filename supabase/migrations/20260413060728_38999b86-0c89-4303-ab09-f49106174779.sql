
CREATE TABLE public.ntd_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  beneficiary_name TEXT NOT NULL,
  beneficiary_age TEXT,
  beneficiary_sex TEXT,
  beneficiary_phone TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  community TEXT,
  notes TEXT,
  protocol_id TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  confidence_score INTEGER DEFAULT 0,
  suggested_stage TEXT,
  referral_urgency TEXT,
  referral_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ntd_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own assessments"
ON public.ntd_assessments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own assessments"
ON public.ntd_assessments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assessments"
ON public.ntd_assessments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_ntd_assessments_user ON public.ntd_assessments(user_id);
CREATE INDEX idx_ntd_assessments_protocol ON public.ntd_assessments(protocol_id);
