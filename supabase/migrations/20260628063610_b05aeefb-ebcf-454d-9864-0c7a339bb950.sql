-- Admin overrides for duplicate-flagged ACSM / IRF submissions
CREATE TABLE public.acsm_duplicate_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  source_table TEXT NOT NULL CHECK (source_table IN ('irf_reports','acsm_reports')),
  submission_id UUID NOT NULL,
  signature TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('unique','rejected')),
  reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, submission_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acsm_duplicate_overrides TO authenticated;
GRANT ALL ON public.acsm_duplicate_overrides TO service_role;

ALTER TABLE public.acsm_duplicate_overrides ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read overrides so dashboards reflect decisions
CREATE POLICY "Authenticated can read duplicate overrides"
  ON public.acsm_duplicate_overrides FOR SELECT
  TO authenticated
  USING (true);

-- Only admins / owners may create, edit or remove overrides
CREATE POLICY "Admins manage duplicate overrides (insert)"
  ON public.acsm_duplicate_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Admins manage duplicate overrides (update)"
  ON public.acsm_duplicate_overrides FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Admins manage duplicate overrides (delete)"
  ON public.acsm_duplicate_overrides FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE INDEX idx_acsm_dup_overrides_lookup
  ON public.acsm_duplicate_overrides (source_table, submission_id);
CREATE INDEX idx_acsm_dup_overrides_project
  ON public.acsm_duplicate_overrides (project_id);

CREATE TRIGGER update_acsm_duplicate_overrides_updated_at
  BEFORE UPDATE ON public.acsm_duplicate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime so dashboards recompute unique counts instantly on a decision
ALTER PUBLICATION supabase_realtime ADD TABLE public.acsm_duplicate_overrides;