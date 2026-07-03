
-- Data sources for the Looker-style dashboard studio
CREATE TABLE public.dashboard_data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('form','table','google_sheet','csv_upload','rest_api')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_data_sources TO authenticated;
GRANT ALL ON public.dashboard_data_sources TO service_role;

ALTER TABLE public.dashboard_data_sources ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a dashboard editor (owner / co-owner / super_admin / systems_admin)
CREATE OR REPLACE FUNCTION public.can_edit_dashboards(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user_id AND (p.is_owner OR p.is_co_owner))
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role IN ('super_admin','systems_admin'));
$$;

CREATE POLICY "Authenticated can view data sources"
  ON public.dashboard_data_sources FOR SELECT TO authenticated USING (true);

CREATE POLICY "Editors can insert data sources"
  ON public.dashboard_data_sources FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors can update data sources"
  ON public.dashboard_data_sources FOR UPDATE TO authenticated
  USING (public.can_edit_dashboards(auth.uid())) WITH CHECK (public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors can delete data sources"
  ON public.dashboard_data_sources FOR DELETE TO authenticated
  USING (public.can_edit_dashboards(auth.uid()));

CREATE TRIGGER update_dashboard_data_sources_updated_at
  BEFORE UPDATE ON public.dashboard_data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-widget data source override
ALTER TABLE public.dashboard_widgets
  ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES public.dashboard_data_sources(id) ON DELETE SET NULL;

-- Dashboard default data source; allow form-less dashboards
ALTER TABLE public.custom_dashboards
  ADD COLUMN IF NOT EXISTS default_data_source_id UUID REFERENCES public.dashboard_data_sources(id) ON DELETE SET NULL;
ALTER TABLE public.custom_dashboards ALTER COLUMN form_id DROP NOT NULL;

-- Let dashboard editors manage ANY dashboard/widget (in addition to existing policies)
CREATE POLICY "Editors manage all dashboards"
  ON public.custom_dashboards FOR ALL TO authenticated
  USING (public.can_edit_dashboards(auth.uid())) WITH CHECK (public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors manage all widgets"
  ON public.dashboard_widgets FOR ALL TO authenticated
  USING (public.can_edit_dashboards(auth.uid())) WITH CHECK (public.can_edit_dashboards(auth.uid()));
