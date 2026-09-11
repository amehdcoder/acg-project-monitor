
CREATE TABLE public.project_access_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  join_code text NOT NULL,
  code_hash text NOT NULL,
  pin_hash text,
  allow_forms boolean NOT NULL DEFAULT true,
  allow_cases boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_access_configs TO authenticated;
GRANT ALL ON public.project_access_configs TO service_role;
ALTER TABLE public.project_access_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project access configs"
ON public.project_access_configs FOR ALL TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = (SELECT auth.uid()))
)
WITH CHECK (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = (SELECT auth.uid()))
);

CREATE TABLE public.project_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text NOT NULL,
  token_hash text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  records_sent integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, device_id)
);

GRANT SELECT, UPDATE ON public.project_devices TO authenticated;
GRANT ALL ON public.project_devices TO service_role;
ALTER TABLE public.project_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view project devices"
ON public.project_devices FOR SELECT TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = (SELECT auth.uid()))
);

CREATE POLICY "Admins revoke project devices"
ON public.project_devices FOR UPDATE TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = (SELECT auth.uid()))
)
WITH CHECK (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = (SELECT auth.uid()))
);

CREATE TABLE public.project_enroll_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code text,
  ip text,
  success boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.project_enroll_attempts TO service_role;
ALTER TABLE public.project_enroll_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read enroll attempts"
ON public.project_enroll_attempts FOR SELECT TO authenticated
USING (public.is_admin((SELECT auth.uid())));

CREATE INDEX idx_project_devices_project ON public.project_devices(project_id);
CREATE INDEX idx_project_enroll_attempts_created ON public.project_enroll_attempts(created_at DESC);

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS collector_label text;

CREATE TRIGGER update_project_access_configs_updated_at
BEFORE UPDATE ON public.project_access_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_devices_updated_at
BEFORE UPDATE ON public.project_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
