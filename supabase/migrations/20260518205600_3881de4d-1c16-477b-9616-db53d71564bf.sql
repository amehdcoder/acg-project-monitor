
-- Gap clusters detected by DBSCAN
CREATE TABLE IF NOT EXISTS public.ces_gap_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_key TEXT NOT NULL UNIQUE,
  survey_id UUID,
  project_id UUID,
  centroid_lat DOUBLE PRECISION NOT NULL,
  centroid_lng DOUBLE PRECISION NOT NULL,
  household_count INTEGER NOT NULL,
  refused_count INTEGER NOT NULL DEFAULT 0,
  absent_count INTEGER NOT NULL DEFAULT 0,
  not_treated_count INTEGER NOT NULL DEFAULT 0,
  dominant_cause TEXT NOT NULL,
  ai_confidence_score INTEGER NOT NULL DEFAULT 0,
  ai_label TEXT,
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'detected',
  household_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_gap_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gap clusters"
  ON public.ces_gap_clusters FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage gap clusters"
  ON public.ces_gap_clusters FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated insert gap clusters"
  ON public.ces_gap_clusters FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update gap clusters"
  ON public.ces_gap_clusters FOR UPDATE
  TO authenticated USING (true);

-- Mop-up team assignments
CREATE TABLE IF NOT EXISTS public.ces_mopup_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_id UUID REFERENCES public.ces_gap_clusters(id) ON DELETE CASCADE,
  survey_id UUID,
  assigned_user_id UUID,
  assigned_team_name TEXT NOT NULL,
  target_date DATE NOT NULL,
  target_hh_count INTEGER NOT NULL DEFAULT 0,
  completed_hh_count INTEGER NOT NULL DEFAULT 0,
  resources TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ces_mopup_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view mopup"
  ON public.ces_mopup_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated create mopup"
  ON public.ces_mopup_assignments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "Creators or admins update mopup"
  ON public.ces_mopup_assignments FOR UPDATE
  TO authenticated USING (auth.uid() = created_by OR auth.uid() = assigned_user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins delete mopup"
  ON public.ces_mopup_assignments FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_mopup_cluster ON public.ces_mopup_assignments(cluster_id);
CREATE INDEX IF NOT EXISTS idx_mopup_user ON public.ces_mopup_assignments(assigned_user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_gap_clusters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_mopup_assignments;
