CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  app_kind text NOT NULL DEFAULT 'custom',
  direction text NOT NULL DEFAULT 'both' CHECK (direction IN ('pull','push','both')),
  base_url text,
  target_type text NOT NULL CHECK (target_type IN ('form','records')),
  target_id uuid NOT NULL,
  target_label text,
  external_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_detect boolean NOT NULL DEFAULT true,
  webhook_endpoint_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX integration_connections_project_idx ON public.integration_connections(project_id);
CREATE POLICY "members read connections" ON public.integration_connections FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "members add connections" ON public.integration_connections FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id)));
CREATE POLICY "members edit connections" ON public.integration_connections FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "members remove connections" ON public.integration_connections FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));