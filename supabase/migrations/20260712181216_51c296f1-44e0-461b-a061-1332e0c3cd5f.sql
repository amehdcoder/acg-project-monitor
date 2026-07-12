-- Shared reference-data registry for offline-creatable location entities
CREATE TABLE public.reference_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('community','village','location_hub')),
  name text NOT NULL,
  state text,
  lga text,
  ward text,
  latitude double precision,
  longitude double precision,
  parent_id uuid REFERENCES public.reference_locations(id) ON DELETE SET NULL,
  project_id uuid,
  -- client-generated idempotency key (the temp local UUID). lets the sync engine
  -- resolve a locally-created draft to its committed server row without duplicates.
  local_ref text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (created_by, local_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reference_locations TO authenticated;
GRANT ALL ON public.reference_locations TO service_role;

ALTER TABLE public.reference_locations ENABLE ROW LEVEL SECURITY;

-- Reference data is shared across supervisors for selection in every form.
CREATE POLICY "Authenticated can read reference locations"
  ON public.reference_locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create reference locations"
  ON public.reference_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update their reference locations"
  ON public.reference_locations FOR UPDATE TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can delete their reference locations"
  ON public.reference_locations FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE INDEX idx_reference_locations_type ON public.reference_locations(entity_type);
CREATE INDEX idx_reference_locations_geo ON public.reference_locations(state, lga, ward);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_reference_locations_updated_at
  BEFORE UPDATE ON public.reference_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();