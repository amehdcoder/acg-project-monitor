CREATE TABLE public.lqas_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  eu_level text NOT NULL DEFAULT 'lga' CHECK (eu_level IN ('state','lga','ward','flhf','community')),
  eu_name text NOT NULL,
  state text, lga text, ward text, flhf_name text, community_name text,
  team text,
  sampled integer NOT NULL CHECK (sampled > 0 AND sampled <= 200),
  covered integer NOT NULL CHECK (covered >= 0),
  security_mode boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'kobo',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lqas_covered_le_sampled CHECK (covered <= sampled),
  UNIQUE (idempotency_key, project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lqas_results TO authenticated;
GRANT ALL ON public.lqas_results TO service_role;
ALTER TABLE public.lqas_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY lqas_read ON public.lqas_results FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()) OR submitted_by = auth.uid() OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY lqas_insert ON public.lqas_results FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR (submitted_by = auth.uid() AND public.is_project_member(auth.uid(), project_id)));
CREATE POLICY lqas_update ON public.lqas_results FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR submitted_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR submitted_by = auth.uid());
CREATE POLICY lqas_delete ON public.lqas_results FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX lqas_results_project_idx ON public.lqas_results (project_id, eu_level, eu_name);
ALTER PUBLICATION supabase_realtime ADD TABLE public.lqas_results;