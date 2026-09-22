
CREATE TABLE public.health_exchange_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dhis2','fhir','lmis')),
  base_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('bearer','basic','none')),
  username text,
  org_unit_id text,
  dataset_id text,
  default_period_type text NOT NULL DEFAULT 'Monthly',
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_status text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_exchange_connections TO authenticated;
GRANT ALL ON public.health_exchange_connections TO service_role;
ALTER TABLE public.health_exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read exchange connections" ON public.health_exchange_connections
  FOR SELECT TO authenticated
  USING (public.is_project_member((SELECT auth.uid()), project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));
CREATE POLICY "admins write exchange connections" ON public.health_exchange_connections
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));

CREATE TABLE public.health_exchange_credentials (
  connection_id uuid PRIMARY KEY REFERENCES public.health_exchange_connections(id) ON DELETE CASCADE,
  secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.health_exchange_credentials TO service_role;
ALTER TABLE public.health_exchange_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.health_exchange_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.health_exchange_connections(id) ON DELETE CASCADE,
  indicator_key text NOT NULL,
  indicator_label text,
  remote_id text NOT NULL,
  remote_name text,
  category_option_combo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, indicator_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_exchange_mappings TO authenticated;
GRANT ALL ON public.health_exchange_mappings TO service_role;
ALTER TABLE public.health_exchange_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read exchange mappings" ON public.health_exchange_mappings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.health_exchange_connections c WHERE c.id = connection_id
    AND (public.is_project_member((SELECT auth.uid()), c.project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'))));
CREATE POLICY "admins write exchange mappings" ON public.health_exchange_mappings
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));

CREATE TABLE public.health_exchange_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  connection_id uuid REFERENCES public.health_exchange_connections(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('push','pull','test')),
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','error','partial')),
  record_count integer NOT NULL DEFAULT 0,
  message text,
  payload jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.health_exchange_sync_logs TO authenticated;
GRANT ALL ON public.health_exchange_sync_logs TO service_role;
ALTER TABLE public.health_exchange_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read exchange logs" ON public.health_exchange_sync_logs
  FOR SELECT TO authenticated
  USING (public.is_project_member((SELECT auth.uid()), project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));
CREATE INDEX idx_health_exchange_logs_project ON public.health_exchange_sync_logs (project_id, created_at DESC);

CREATE TABLE public.facility_commodity_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  facility_id uuid REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  external_facility_code text,
  commodity_code text NOT NULL,
  commodity_name text NOT NULL,
  category text NOT NULL DEFAULT 'morbidity_kit',
  unit text,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  reorder_level numeric,
  expiry_date date,
  source text NOT NULL DEFAULT 'manual',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, facility_id, commodity_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facility_commodity_stock TO authenticated;
GRANT ALL ON public.facility_commodity_stock TO service_role;
ALTER TABLE public.facility_commodity_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read commodity stock" ON public.facility_commodity_stock
  FOR SELECT TO authenticated
  USING (public.is_project_member((SELECT auth.uid()), project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));
CREATE POLICY "members write commodity stock" ON public.facility_commodity_stock
  FOR ALL TO authenticated
  USING (public.is_project_member((SELECT auth.uid()), project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'))
  WITH CHECK (public.is_project_member((SELECT auth.uid()), project_id) OR public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'systems_admin'));
CREATE INDEX idx_commodity_stock_project ON public.facility_commodity_stock (project_id, facility_id);

CREATE TRIGGER trg_health_exchange_connections_updated
  BEFORE UPDATE ON public.health_exchange_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_health_exchange_mappings_updated
  BEFORE UPDATE ON public.health_exchange_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_facility_commodity_stock_updated
  BEFORE UPDATE ON public.facility_commodity_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
