
CREATE TABLE IF NOT EXISTS public.microplan_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  kobo_form_uid TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  flhf_name TEXT,
  community_name TEXT,
  target_population INTEGER,
  total_treated INTEGER,
  total_vaccinated INTEGER,
  doses_administered INTEGER,
  refusals INTEGER,
  missed_population INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  payload JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS microplan_coverage_uniq_idem ON public.microplan_coverage (idempotency_key, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS microplan_coverage_project_idx ON public.microplan_coverage (project_id);
CREATE INDEX IF NOT EXISTS microplan_coverage_submitter_idx ON public.microplan_coverage (submitted_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_coverage TO authenticated;
GRANT ALL ON public.microplan_coverage TO service_role;
ALTER TABLE public.microplan_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coverage_own_insert" ON public.microplan_coverage
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "coverage_read_scope" ON public.microplan_coverage
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  );

CREATE POLICY "coverage_admin_write" ON public.microplan_coverage
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR submitted_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR submitted_by = auth.uid());

CREATE POLICY "coverage_admin_delete" ON public.microplan_coverage
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER microplan_coverage_updated
  BEFORE UPDATE ON public.microplan_coverage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.microplan_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  kobo_form_uid TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  flhf_name TEXT,
  medicine_name TEXT,
  received_quantity NUMERIC,
  administered_quantity NUMERIC,
  wasted_quantity NUMERIC,
  returned_quantity NUMERIC,
  discrepancy_notes TEXT,
  payload JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS microplan_reconciliation_uniq_idem ON public.microplan_reconciliation (idempotency_key, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS microplan_reconciliation_project_idx ON public.microplan_reconciliation (project_id);
CREATE INDEX IF NOT EXISTS microplan_reconciliation_submitter_idx ON public.microplan_reconciliation (submitted_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_reconciliation TO authenticated;
GRANT ALL ON public.microplan_reconciliation TO service_role;
ALTER TABLE public.microplan_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recon_own_insert" ON public.microplan_reconciliation
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "recon_read_scope" ON public.microplan_reconciliation
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  );

CREATE POLICY "recon_admin_write" ON public.microplan_reconciliation
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR submitted_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR submitted_by = auth.uid());

CREATE POLICY "recon_admin_delete" ON public.microplan_reconciliation
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER microplan_reconciliation_updated
  BEFORE UPDATE ON public.microplan_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_coverage;
ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_reconciliation;
