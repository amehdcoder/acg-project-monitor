
-- Table for uploaded VR/Video simulation games linked to forms/projects
CREATE TABLE public.vr_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  simulation_type text NOT NULL DEFAULT 'vr_3d',
  form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  scenario_data jsonb NOT NULL DEFAULT '{}',
  video_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table for granting access to simulations
CREATE TABLE public.vr_simulation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.vr_simulations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(simulation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.vr_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vr_simulation_access ENABLE ROW LEVEL SECURITY;

-- RLS: Owner can manage all simulations
CREATE POLICY "Owner can manage simulations" ON public.vr_simulations
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

-- RLS: Admins can create/view simulations
CREATE POLICY "Admins can manage simulations" ON public.vr_simulations
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- RLS: Users with access can view simulations
CREATE POLICY "Granted users can view simulations" ON public.vr_simulations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vr_simulation_access
    WHERE simulation_id = vr_simulations.id AND user_id = auth.uid()
  ));

-- RLS for access table
CREATE POLICY "Owner can manage simulation access" ON public.vr_simulation_access
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Admins can manage simulation access" ON public.vr_simulation_access
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Users can view their own access" ON public.vr_simulation_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Storage bucket for uploaded simulation videos
INSERT INTO storage.buckets (id, name, public) VALUES ('vr-simulations', 'vr-simulations', false);

-- Storage policies
CREATE POLICY "Admins can upload simulations" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vr-simulations' AND is_admin(auth.uid()));

CREATE POLICY "Admins can view simulation files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vr-simulations' AND is_admin(auth.uid()));

CREATE POLICY "Granted users can view simulation files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vr-simulations' AND EXISTS (
    SELECT 1 FROM public.vr_simulation_access WHERE user_id = auth.uid()
  ));
