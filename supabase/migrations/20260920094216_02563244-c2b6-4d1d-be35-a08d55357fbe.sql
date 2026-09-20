CREATE TABLE public.livelihood_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  opportunity_id uuid,
  beneficiary_id uuid NOT NULL,
  assessment_id uuid,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  verifier_id uuid,
  verifier_name text,
  verifier_role text,
  latitude double precision,
  longitude double precision,
  finding text NOT NULL DEFAULT 'confirmed',
  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_vulnerability integer,
  predicted_vulnerability integer,
  recommendation text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_livelihood_verifications_project ON public.livelihood_verifications (project_id, created_at DESC);
CREATE INDEX idx_livelihood_verifications_beneficiary ON public.livelihood_verifications (beneficiary_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.livelihood_verifications TO authenticated;
GRANT ALL ON public.livelihood_verifications TO service_role;

ALTER TABLE public.livelihood_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read livelihood verifications"
ON public.livelihood_verifications FOR SELECT TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR public.is_project_member((SELECT auth.uid()), project_id));

CREATE POLICY "Project members create livelihood verifications"
ON public.livelihood_verifications FOR INSERT TO authenticated
WITH CHECK (public.is_admin((SELECT auth.uid())) OR public.is_project_member((SELECT auth.uid()), project_id));

CREATE POLICY "Verifier or admin updates livelihood verifications"
ON public.livelihood_verifications FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR verifier_id = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR verifier_id = (SELECT auth.uid()));

CREATE POLICY "Admins delete livelihood verifications"
ON public.livelihood_verifications FOR DELETE TO authenticated
USING (public.is_admin((SELECT auth.uid())));

CREATE TRIGGER update_livelihood_verifications_updated_at
BEFORE UPDATE ON public.livelihood_verifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();