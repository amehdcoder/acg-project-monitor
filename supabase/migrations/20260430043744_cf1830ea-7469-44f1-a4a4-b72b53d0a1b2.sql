-- 1. Designations enum
DO $$ BEGIN
  CREATE TYPE public.microplan_designation AS ENUM (
    'state_supervisor',
    'lga_supervisor',
    'ward_supervisor',
    'flhf',
    'cdd',
    'partner',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Designation assignments table
CREATE TABLE IF NOT EXISTS public.microplan_designation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  designation public.microplan_designation NOT NULL,
  label text,
  states text[] NOT NULL DEFAULT '{}',
  lgas text[] NOT NULL DEFAULT '{}',
  wards text[] NOT NULL DEFAULT '{}',
  flhfs text[] NOT NULL DEFAULT '{}',
  communities text[] NOT NULL DEFAULT '{}',
  settlements text[] NOT NULL DEFAULT '{}',
  notes text,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.microplan_designation_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage designation assignments"
  ON public.microplan_designation_assignments FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view their own designation assignments"
  ON public.microplan_designation_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_microplan_designation_updated
  BEFORE UPDATE ON public.microplan_designation_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_mda_user ON public.microplan_designation_assignments(user_id);

-- 3. Medicine allocations table
CREATE TABLE IF NOT EXISTS public.microplan_medicine_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  state text,
  lga text NOT NULL,
  campaign_type text,
  medicine_name text,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.microplan_medicine_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read medicine allocations"
  ON public.microplan_medicine_allocations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins insert medicine allocations"
  ON public.microplan_medicine_allocations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Admins update medicine allocations"
  ON public.microplan_medicine_allocations FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete medicine allocations"
  ON public.microplan_medicine_allocations FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_microplan_alloc_updated
  BEFORE UPDATE ON public.microplan_medicine_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_mma_project_lga ON public.microplan_medicine_allocations(project_id, lga);

-- 4. Allocation history table
CREATE TABLE IF NOT EXISTS public.microplan_allocation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid,
  project_id uuid NOT NULL,
  state text,
  lga text NOT NULL,
  year integer,
  campaign_type text,
  medicine_name text,
  old_amount numeric,
  new_amount numeric,
  action text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public.microplan_allocation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view allocation history"
  ON public.microplan_allocation_history FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR auth.uid() = changed_by);

CREATE INDEX IF NOT EXISTS idx_mah_project_lga ON public.microplan_allocation_history(project_id, lga);

-- 5. History trigger function
CREATE OR REPLACE FUNCTION public.track_microplan_allocation_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.microplan_allocation_history
      (allocation_id, project_id, state, lga, year, campaign_type, medicine_name, old_amount, new_amount, action, changed_by)
    VALUES
      (NEW.id, NEW.project_id, NEW.state, NEW.lga, NEW.year, NEW.campaign_type, NEW.medicine_name, NULL, NEW.amount, 'create', COALESCE(auth.uid(), NEW.created_by));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.medicine_name IS DISTINCT FROM NEW.medicine_name
       OR OLD.notes IS DISTINCT FROM NEW.notes THEN
      INSERT INTO public.microplan_allocation_history
        (allocation_id, project_id, state, lga, year, campaign_type, medicine_name, old_amount, new_amount, action, changed_by)
      VALUES
        (NEW.id, NEW.project_id, NEW.state, NEW.lga, NEW.year, NEW.campaign_type, NEW.medicine_name, OLD.amount, NEW.amount, 'update', COALESCE(auth.uid(), NEW.updated_by, NEW.created_by));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.microplan_allocation_history
      (allocation_id, project_id, state, lga, year, campaign_type, medicine_name, old_amount, new_amount, action, changed_by)
    VALUES
      (OLD.id, OLD.project_id, OLD.state, OLD.lga, OLD.year, OLD.campaign_type, OLD.medicine_name, OLD.amount, NULL, 'delete', COALESCE(auth.uid(), OLD.created_by));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_microplan_allocations ON public.microplan_medicine_allocations;
CREATE TRIGGER trg_track_microplan_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.microplan_medicine_allocations
  FOR EACH ROW EXECUTE FUNCTION public.track_microplan_allocation_changes();

-- 6. Helper function: does user have any designation matching a scope?
CREATE OR REPLACE FUNCTION public.user_has_microplan_scope(_user_id uuid, _state text, _lga text, _ward text, _flhf text, _community text, _settlement text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.microplan_designation_assignments
    WHERE user_id = _user_id
      AND (
        (cardinality(states) = 0 OR _state = ANY(states))
        AND (cardinality(lgas) = 0 OR _lga = ANY(lgas))
        AND (cardinality(wards) = 0 OR _ward = ANY(wards))
        AND (cardinality(flhfs) = 0 OR _flhf = ANY(flhfs))
        AND (cardinality(communities) = 0 OR _community = ANY(communities))
        AND (cardinality(settlements) = 0 OR _settlement = ANY(settlements))
      )
  )
$$;