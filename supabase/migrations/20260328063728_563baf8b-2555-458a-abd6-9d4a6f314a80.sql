
-- Microplan entries table based on NTDs Microplan Template
CREATE TABLE public.microplan_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID,
  
  -- Administrative hierarchy
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  ward TEXT NOT NULL,
  
  -- FLHF Information
  flhf_name TEXT NOT NULL,
  flhf_incharge_name TEXT,
  flhf_incharge_phone TEXT,
  
  -- Community Information
  community_name TEXT NOT NULL,
  community_leader_name TEXT,
  community_leader_phone TEXT,
  community_distance_to_flhf_km NUMERIC,
  
  -- Settlement Information
  settlement_name TEXT,
  settlement_mai_unguwa TEXT,
  settlement_distance_to_flhf_km NUMERIC,
  
  -- Terrain & Access
  terrain_type TEXT,
  accessibility TEXT,
  security_clearance TEXT,
  
  -- Population Estimates
  estimated_total_population INTEGER,
  estimated_children_5_14 INTEGER,
  estimated_adults_15_plus INTEGER,
  estimated_children_0_4 INTEGER,
  number_of_households INTEGER,
  
  -- CDD Information
  cdd_names TEXT,
  cdd_phone_numbers TEXT,
  cdd_from_community BOOLEAN,
  
  -- Geo-enabled fields (from handbook)
  community_latitude DOUBLE PRECISION,
  community_longitude DOUBLE PRECISION,
  community_gps_accuracy DOUBLE PRECISION,
  settlement_latitude DOUBLE PRECISION,
  settlement_longitude DOUBLE PRECISION,
  flhf_latitude DOUBLE PRECISION,
  flhf_longitude DOUBLE PRECISION,
  
  -- Catchment area boundary (GeoJSON polygon)
  catchment_boundary JSONB,
  
  -- Metadata
  campaign_type TEXT DEFAULT 'ntd',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.microplan_entries ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "Owner can manage microplan entries"
ON public.microplan_entries FOR ALL TO authenticated
USING (is_owner(auth.uid()))
WITH CHECK (is_owner(auth.uid()));

-- Granted admins can view
CREATE POLICY "Granted admins can view microplan entries"
ON public.microplan_entries FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_page_access
  WHERE admin_page_access.user_id = auth.uid()
  AND admin_page_access.page_id = 'microplanning'
));

-- Granted admins can insert
CREATE POLICY "Granted admins can insert microplan entries"
ON public.microplan_entries FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM admin_page_access
  WHERE admin_page_access.user_id = auth.uid()
  AND admin_page_access.page_id = 'microplanning'
));

-- Granted admins can update
CREATE POLICY "Granted admins can update microplan entries"
ON public.microplan_entries FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_page_access
  WHERE admin_page_access.user_id = auth.uid()
  AND admin_page_access.page_id = 'microplanning'
));

-- Granted admins can delete
CREATE POLICY "Granted admins can delete microplan entries"
ON public.microplan_entries FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_page_access
  WHERE admin_page_access.user_id = auth.uid()
  AND admin_page_access.page_id = 'microplanning'
));

-- Updated_at trigger
CREATE TRIGGER update_microplan_entries_updated_at
  BEFORE UPDATE ON public.microplan_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
