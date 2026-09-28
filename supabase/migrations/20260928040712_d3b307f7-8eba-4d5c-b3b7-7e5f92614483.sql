UPDATE public.microplan_geo_exclusions
SET project_id = substring(scope_id from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
WHERE project_id IS NULL
  AND scope_id ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = substring(scope_id from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid);

CREATE TABLE public.microplan_project_settings (
  project_key text NOT NULL,
  setting_key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_key, setting_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_project_settings TO authenticated;
GRANT ALL ON public.microplan_project_settings TO service_role;
ALTER TABLE public.microplan_project_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read microplan settings" ON public.microplan_project_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners and super admins add microplan settings" ON public.microplan_project_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Owners and super admins change microplan settings" ON public.microplan_project_settings
  FOR UPDATE TO authenticated USING (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Owners and super admins remove microplan settings" ON public.microplan_project_settings
  FOR DELETE TO authenticated USING (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_microplan_project_settings_updated BEFORE UPDATE ON public.microplan_project_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_project_settings;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_geo_exclusions;
EXCEPTION WHEN others THEN NULL; END $$;