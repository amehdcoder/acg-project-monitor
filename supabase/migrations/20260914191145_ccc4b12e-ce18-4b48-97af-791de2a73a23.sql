-- Community water / sanitation points shared by households
CREATE TABLE IF NOT EXISTS public.community_wash_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'borehole',
  sanitation_type text,
  is_improved boolean NOT NULL DEFAULT true,
  state text, lga text, ward text, village text,
  latitude double precision,
  longitude double precision,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_wash_sources TO authenticated;
GRANT ALL ON public.community_wash_sources TO service_role;
ALTER TABLE public.community_wash_sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wash_sources_project ON public.community_wash_sources(project_id);

CREATE POLICY "Project members view wash sources" ON public.community_wash_sources
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create wash sources" ON public.community_wash_sources
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Project members update wash sources" ON public.community_wash_sources
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Admins delete wash sources" ON public.community_wash_sources
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- Household / community clusters
CREATE TABLE IF NOT EXISTS public.beneficiary_households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  household_code text NOT NULL,
  name text,
  head_name text,
  household_size integer NOT NULL DEFAULT 1,
  state text, lga text, ward text, village text,
  latitude double precision,
  longitude double precision,
  wash_source_id uuid REFERENCES public.community_wash_sources(id) ON DELETE SET NULL,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_households TO authenticated;
GRANT ALL ON public.beneficiary_households TO service_role;
ALTER TABLE public.beneficiary_households ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS beneficiary_households_code_key
  ON public.beneficiary_households(project_id, household_code);
CREATE INDEX IF NOT EXISTS idx_households_project ON public.beneficiary_households(project_id);

CREATE POLICY "Project members view households" ON public.beneficiary_households
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create households" ON public.beneficiary_households
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Project members update households" ON public.beneficiary_households
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Admins delete households" ON public.beneficiary_households
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.beneficiary_households(id) ON DELETE SET NULL;
ALTER TABLE public.beneficiaries ADD COLUMN IF NOT EXISTS household_role text;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_household ON public.beneficiaries(household_id);

-- Household mass drug administration rounds
CREATE TABLE IF NOT EXISTS public.household_mda_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.beneficiary_households(id) ON DELETE CASCADE,
  round_name text NOT NULL,
  round_date date NOT NULL DEFAULT CURRENT_DATE,
  disease text NOT NULL DEFAULT 'lymphatic_filariasis',
  drug text,
  persons_eligible integer NOT NULL DEFAULT 0,
  persons_treated integer NOT NULL DEFAULT 0,
  persons_absent integer NOT NULL DEFAULT 0,
  persons_refused integer NOT NULL DEFAULT 0,
  directly_observed boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_mda_rounds TO authenticated;
GRANT ALL ON public.household_mda_rounds TO service_role;
ALTER TABLE public.household_mda_rounds ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mda_rounds_household ON public.household_mda_rounds(household_id, round_date DESC);

CREATE POLICY "Project members view mda rounds" ON public.household_mda_rounds
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create mda rounds" ON public.household_mda_rounds
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Project members update mda rounds" ON public.household_mda_rounds
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Admins delete mda rounds" ON public.household_mda_rounds
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- Computer-vision lesion staging assessments
CREATE TABLE IF NOT EXISTS public.beneficiary_lesion_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.beneficiary_services(id) ON DELETE SET NULL,
  component_key text,
  condition text NOT NULL DEFAULT 'lymphoedema',
  body_site text,
  assessed_on date NOT NULL DEFAULT CURRENT_DATE,
  image_path text,
  reference_mm numeric,
  area_fraction numeric,
  area_mm2 numeric,
  width_fraction numeric,
  redness_index numeric,
  stage integer,
  stage_label text,
  percent_change numeric,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_lesion_assessments TO authenticated;
GRANT ALL ON public.beneficiary_lesion_assessments TO service_role;
ALTER TABLE public.beneficiary_lesion_assessments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lesion_beneficiary
  ON public.beneficiary_lesion_assessments(beneficiary_id, assessed_on DESC);

CREATE POLICY "Project members view lesion assessments" ON public.beneficiary_lesion_assessments
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create lesion assessments" ON public.beneficiary_lesion_assessments
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Project members update lesion assessments" ON public.beneficiary_lesion_assessments
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Admins delete lesion assessments" ON public.beneficiary_lesion_assessments
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- CHEW home visit dispatch driven by loss-to-follow-up risk
CREATE TABLE IF NOT EXISTS public.beneficiary_home_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  assigned_to uuid,
  assigned_name text,
  risk_score numeric,
  risk_band text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date date,
  status text NOT NULL DEFAULT 'dispatched',
  outcome text,
  outcome_notes text,
  visited_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_home_visits TO authenticated;
GRANT ALL ON public.beneficiary_home_visits TO service_role;
ALTER TABLE public.beneficiary_home_visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_home_visits_project ON public.beneficiary_home_visits(project_id, due_date);
CREATE INDEX IF NOT EXISTS idx_home_visits_beneficiary ON public.beneficiary_home_visits(beneficiary_id, created_at DESC);

CREATE POLICY "Project members view home visits" ON public.beneficiary_home_visits
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create home visits" ON public.beneficiary_home_visits
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Assignees and creators update home visits" ON public.beneficiary_home_visits
FOR UPDATE TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR created_by = (SELECT auth.uid())
  OR assigned_to = (SELECT auth.uid())
)
WITH CHECK (
  public.is_admin((SELECT auth.uid()))
  OR created_by = (SELECT auth.uid())
  OR assigned_to = (SELECT auth.uid())
);
CREATE POLICY "Admins delete home visits" ON public.beneficiary_home_visits
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

CREATE TRIGGER update_wash_sources_updated_at BEFORE UPDATE ON public.community_wash_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON public.beneficiary_households
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mda_rounds_updated_at BEFORE UPDATE ON public.household_mda_rounds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lesion_assessments_updated_at BEFORE UPDATE ON public.beneficiary_lesion_assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_home_visits_updated_at BEFORE UPDATE ON public.beneficiary_home_visits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();