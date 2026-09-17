ALTER TABLE public.household_mda_rounds
  ADD COLUMN IF NOT EXISTS round_type text NOT NULL DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS drug_batch text,
  ADD COLUMN IF NOT EXISTS drug_expiry date,
  ADD COLUMN IF NOT EXISTS distributor_name text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS facility_id uuid,
  ADD COLUMN IF NOT EXISTS community text,
  ADD COLUMN IF NOT EXISTS revisit_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unregistered_eligible integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unregistered_treated integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.household_mda_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  round_id uuid NOT NULL REFERENCES public.household_mda_rounds(id) ON DELETE CASCADE,
  household_id uuid NOT NULL,
  beneficiary_id uuid,
  person_name text NOT NULL,
  age_years integer,
  sex text,
  outcome text NOT NULL DEFAULT 'treated',
  not_eligible_reason text,
  drug text,
  tablets numeric,
  dose_basis text,
  dose_value numeric,
  directly_observed boolean NOT NULL DEFAULT false,
  adverse_event text,
  adverse_event_serious boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_mda_treatments_round_idx ON public.household_mda_treatments(round_id);
CREATE INDEX IF NOT EXISTS household_mda_treatments_project_idx ON public.household_mda_treatments(project_id);
CREATE INDEX IF NOT EXISTS household_mda_treatments_beneficiary_idx ON public.household_mda_treatments(beneficiary_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_mda_treatments TO authenticated;
GRANT ALL ON public.household_mda_treatments TO service_role;

ALTER TABLE public.household_mda_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read MDA treatments"
  ON public.household_mda_treatments FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));

CREATE POLICY "Project members record MDA treatments"
  ON public.household_mda_treatments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));

CREATE POLICY "Project members update MDA treatments"
  ON public.household_mda_treatments FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));

CREATE POLICY "Project members delete MDA treatments"
  ON public.household_mda_treatments FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR project_id = ANY (public.accessible_project_ids(auth.uid())));

CREATE TRIGGER update_household_mda_treatments_updated_at
  BEFORE UPDATE ON public.household_mda_treatments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();