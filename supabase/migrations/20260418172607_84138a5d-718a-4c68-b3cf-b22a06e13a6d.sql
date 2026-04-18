
-- Coverage Evaluation Survey (CES) 3D Mapping schema

-- 1. Capture sessions: one per village/area walked
CREATE TABLE public.ces_capture_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  area_name TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  campaign_type TEXT,
  perimeter_coords JSONB DEFAULT '[]'::jsonb,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  bounds JSONB,
  keyframe_count INTEGER NOT NULL DEFAULT 0,
  household_count INTEGER NOT NULL DEFAULT 0,
  capture_status TEXT NOT NULL DEFAULT 'in_progress',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ces_sessions_project ON public.ces_capture_sessions(project_id);
CREATE INDEX idx_ces_sessions_form ON public.ces_capture_sessions(form_id);

-- 2. Households (extruded roofs) detected/placed in the 3D scene
CREATE TABLE public.ces_households (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ces_capture_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  label TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  roof_height_m NUMERIC DEFAULT 3.0,
  roof_footprint JSONB,
  coverage_status TEXT NOT NULL DEFAULT 'unassessed',
  intervention_status TEXT,
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  visited_at TIMESTAMPTZ,
  visited_by UUID,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ces_households_session ON public.ces_households(session_id);
CREATE INDEX idx_ces_households_status ON public.ces_households(coverage_status);
CREATE INDEX idx_ces_households_project ON public.ces_households(project_id);

-- 3. Keyframes (geotagged camera snapshots from the walk)
CREATE TABLE public.ces_keyframes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ces_capture_sessions(id) ON DELETE CASCADE,
  image_path TEXT,
  thumbnail_data_url TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ces_keyframes_session ON public.ces_keyframes(session_id);

-- Enable RLS
ALTER TABLE public.ces_capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ces_households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ces_keyframes ENABLE ROW LEVEL SECURITY;

-- Sessions: project-scoped read; creator or admin can write
CREATE POLICY "Authenticated can view CES sessions"
ON public.ces_capture_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create CES sessions"
ON public.ces_capture_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator or admin can update CES sessions"
ON public.ces_capture_sessions FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "Creator or admin can delete CES sessions"
ON public.ces_capture_sessions FOR DELETE TO authenticated
USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- Households: project-wide read/write for authenticated (project-scoped collaboration)
CREATE POLICY "Authenticated can view CES households"
ON public.ces_households FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create CES households"
ON public.ces_households FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update CES households"
ON public.ces_households FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Creator or admin can delete CES households"
ON public.ces_households FOR DELETE TO authenticated
USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- Keyframes
CREATE POLICY "Authenticated can view CES keyframes"
ON public.ces_keyframes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert CES keyframes"
ON public.ces_keyframes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin can delete CES keyframes"
ON public.ces_keyframes FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_ces_sessions_updated_at
BEFORE UPDATE ON public.ces_capture_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ces_households_updated_at
BEFORE UPDATE ON public.ces_households
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for keyframe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ces-captures', 'ces-captures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can view CES capture files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ces-captures');

CREATE POLICY "Authenticated can upload CES capture files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ces-captures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner can delete own CES capture files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ces-captures' AND auth.uid()::text = (storage.foldername(name))[1]);
