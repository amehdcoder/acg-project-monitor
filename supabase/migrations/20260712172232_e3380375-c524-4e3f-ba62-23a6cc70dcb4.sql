-- Idempotency contract on submission tables
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS submission_uuid uuid,
  ADD COLUMN IF NOT EXISTS client_submitted_at timestamptz;
ALTER TABLE public.bloomberg_validations
  ADD COLUMN IF NOT EXISTS submission_uuid uuid,
  ADD COLUMN IF NOT EXISTS client_submitted_at timestamptz;
ALTER TABLE public.seeclear_monitoring
  ADD COLUMN IF NOT EXISTS submission_uuid uuid,
  ADD COLUMN IF NOT EXISTS client_submitted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_submission_uuid_key
  ON public.form_submissions (submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bloomberg_validations_submission_uuid_key
  ON public.bloomberg_validations (submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS seeclear_monitoring_submission_uuid_key
  ON public.seeclear_monitoring (submission_uuid) WHERE submission_uuid IS NOT NULL;

-- Shared updated_at maintainer
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Delta-sync watermark on master tables that lack it
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_project_assignments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_locations_updated_at ON public.locations;
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_project_assignments_updated_at ON public.user_project_assignments;
CREATE TRIGGER update_user_project_assignments_updated_at BEFORE UPDATE ON public.user_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes to make delta queries (updated_at > watermark) fast
CREATE INDEX IF NOT EXISTS locations_updated_at_idx ON public.locations (updated_at);
CREATE INDEX IF NOT EXISTS user_roles_updated_at_idx ON public.user_roles (updated_at);
CREATE INDEX IF NOT EXISTS user_project_assignments_updated_at_idx ON public.user_project_assignments (updated_at);
CREATE INDEX IF NOT EXISTS forms_updated_at_idx ON public.forms (updated_at);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON public.projects (updated_at);
CREATE INDEX IF NOT EXISTS microplan_entries_updated_at_idx ON public.microplan_entries (updated_at);