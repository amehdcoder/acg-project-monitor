CREATE TABLE public.livelihood_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  title text NOT NULL,
  partner text,
  opportunity_type text,
  target_beneficiaries integer NOT NULL DEFAULT 10,
  state text,
  lga text,
  ward text,
  start_date date,
  quota_women_pct integer NOT NULL DEFAULT 50,
  quota_disability_pct integer NOT NULL DEFAULT 30,
  one_per_household boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.livelihood_opportunities TO authenticated;
GRANT ALL ON public.livelihood_opportunities TO service_role;
ALTER TABLE public.livelihood_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read livelihood opportunities"
  ON public.livelihood_opportunities FOR SELECT TO authenticated
  USING (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Project members create livelihood opportunities"
  ON public.livelihood_opportunities FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Project members update livelihood opportunities"
  ON public.livelihood_opportunities FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id))
  WITH CHECK (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Admins delete livelihood opportunities"
  ON public.livelihood_opportunities FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

CREATE TABLE public.livelihood_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  beneficiary_id uuid NOT NULL,
  opportunity_id uuid REFERENCES public.livelihood_opportunities(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  vulnerability_score numeric NOT NULL DEFAULT 0,
  readiness_score numeric NOT NULL DEFAULT 0,
  priority_band text,
  domain_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_package text,
  decision text NOT NULL DEFAULT 'assessed',
  decision_notes text,
  assessed_by uuid,
  assessed_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_livelihood_assessments_project ON public.livelihood_assessments(project_id);
CREATE INDEX idx_livelihood_assessments_beneficiary ON public.livelihood_assessments(beneficiary_id);
CREATE INDEX idx_livelihood_assessments_opportunity ON public.livelihood_assessments(opportunity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.livelihood_assessments TO authenticated;
GRANT ALL ON public.livelihood_assessments TO service_role;
ALTER TABLE public.livelihood_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read livelihood assessments"
  ON public.livelihood_assessments FOR SELECT TO authenticated
  USING (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Project members create livelihood assessments"
  ON public.livelihood_assessments FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Project members update livelihood assessments"
  ON public.livelihood_assessments FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id))
  WITH CHECK (is_admin((SELECT auth.uid())) OR is_project_member((SELECT auth.uid()), project_id));
CREATE POLICY "Admins delete livelihood assessments"
  ON public.livelihood_assessments FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

CREATE TRIGGER update_livelihood_opportunities_updated_at
  BEFORE UPDATE ON public.livelihood_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_livelihood_assessments_updated_at
  BEFORE UPDATE ON public.livelihood_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();