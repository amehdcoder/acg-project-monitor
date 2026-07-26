
CREATE TABLE public.microplan_xlsform_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number INT NOT NULL,
  changelog TEXT NOT NULL DEFAULT '',
  notes TEXT,
  xlsx_base64 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT,
  survey_row_count INT NOT NULL DEFAULT 0,
  choices_row_count INT NOT NULL DEFAULT 0,
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  kobo_asset_uid TEXT,
  kobo_version_id TEXT,
  kobo_server_url TEXT,
  kobo_deployed_at TIMESTAMPTZ,
  kobo_upload_response JSONB,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT microplan_xlsform_versions_version_unique UNIQUE (version_number)
);

GRANT SELECT, INSERT, UPDATE ON public.microplan_xlsform_versions TO authenticated;
GRANT ALL ON public.microplan_xlsform_versions TO service_role;

ALTER TABLE public.microplan_xlsform_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view xlsform versions"
  ON public.microplan_xlsform_versions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'systems_admin'::app_role)
    OR public.is_owner_or_co_owner(auth.uid())
  );

CREATE POLICY "Admins can insert xlsform versions"
  ON public.microplan_xlsform_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'systems_admin'::app_role)
    OR public.is_owner_or_co_owner(auth.uid())
  );

CREATE POLICY "Admins can update xlsform versions"
  ON public.microplan_xlsform_versions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'systems_admin'::app_role)
    OR public.is_owner_or_co_owner(auth.uid())
  );

CREATE INDEX idx_microplan_xlsform_versions_active
  ON public.microplan_xlsform_versions (is_active) WHERE is_active;
CREATE INDEX idx_microplan_xlsform_versions_created_at
  ON public.microplan_xlsform_versions (created_at DESC);

CREATE TRIGGER trg_microplan_xlsform_versions_updated
  BEFORE UPDATE ON public.microplan_xlsform_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
