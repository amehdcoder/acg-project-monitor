CREATE TABLE public.lqas_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  disease text NOT NULL,
  drug text,
  eu_level text NOT NULL CHECK (eu_level IN ('state','lga','ward','flhf')),
  eu_key text NOT NULL,
  eu_name text NOT NULL,
  upper_threshold int NOT NULL DEFAULT 80 CHECK (upper_threshold BETWEEN 1 AND 100),
  lower_threshold int NOT NULL DEFAULT 50 CHECK (lower_threshold BETWEEN 0 AND 99),
  sample_n int NOT NULL DEFAULT 19 CHECK (sample_n BETWEEN 10 AND 30),
  decision_rule int NOT NULL,
  verification_date date,
  status text NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned','Active','Completed')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lower_threshold < upper_threshold)
);
CREATE TABLE public.lqas_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.lqas_rounds(id) ON DELETE CASCADE,
  lot_name text NOT NULL,
  lot_type text NOT NULL,
  lot_key text NOT NULL,
  population int NOT NULL DEFAULT 0,
  households int NOT NULL DEFAULT 0,
  lat double precision, lng double precision,
  supervisor_id uuid,
  security_status text NOT NULL DEFAULT 'Green',
  risk_flags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','PASS','FAIL')),
  covered_count int,
  mop_up_required boolean NOT NULL DEFAULT false,
  data_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, lot_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lqas_rounds TO authenticated;
GRANT ALL ON public.lqas_rounds TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lqas_lots TO authenticated;
GRANT ALL ON public.lqas_lots TO service_role;
ALTER TABLE public.lqas_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lqas_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lqas_rounds_read ON public.lqas_rounds FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY lqas_rounds_insert ON public.lqas_rounds FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id)));
CREATE POLICY lqas_rounds_update ON public.lqas_rounds FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid()) WITH CHECK (public.is_admin(auth.uid()) OR created_by = auth.uid());
CREATE POLICY lqas_rounds_delete ON public.lqas_rounds FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid());
CREATE POLICY lqas_lots_read ON public.lqas_lots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lqas_rounds r WHERE r.id = round_id));
CREATE POLICY lqas_lots_write ON public.lqas_lots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lqas_rounds r WHERE r.id = round_id AND (public.is_admin(auth.uid()) OR r.created_by = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lqas_rounds r WHERE r.id = round_id AND (public.is_admin(auth.uid()) OR r.created_by = auth.uid())));
CREATE INDEX lqas_rounds_project_idx ON public.lqas_rounds (project_id, created_at DESC);
CREATE INDEX lqas_lots_round_idx ON public.lqas_lots (round_id);