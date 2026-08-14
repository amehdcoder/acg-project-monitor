CREATE TABLE public.microplan_geo_exclusions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_id text NOT NULL,
  project_id uuid NULL,
  ex_key text NOT NULL,
  level text NOT NULL CHECK (level IN ('LGA','Ward')),
  state text,
  lga text,
  ward text,
  records integer NOT NULL DEFAULT 0,
  population bigint NOT NULL DEFAULT 0,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, ex_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_geo_exclusions TO authenticated;
GRANT ALL ON public.microplan_geo_exclusions TO service_role;

ALTER TABLE public.microplan_geo_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view archived geographies"
  ON public.microplan_geo_exclusions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can archive geographies"
  ON public.microplan_geo_exclusions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Admins can update archived geographies"
  ON public.microplan_geo_exclusions FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Admins can restore archived geographies"
  ON public.microplan_geo_exclusions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE INDEX idx_microplan_geo_exclusions_scope ON public.microplan_geo_exclusions (scope_id);

CREATE TRIGGER update_microplan_geo_exclusions_updated_at
  BEFORE UPDATE ON public.microplan_geo_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();