
ALTER TABLE public.beneficiary_lesion_assessments
  ADD COLUMN IF NOT EXISTS confirmed_stage integer,
  ADD COLUMN IF NOT EXISTS confirmed_stage_label text,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS model_stage integer,
  ADD COLUMN IF NOT EXISTS model_confidence numeric,
  ADD COLUMN IF NOT EXISTS features jsonb;

ALTER TABLE public.safeguarding_concerns
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vault_cipher jsonb;

ALTER TABLE public.safeguarding_notes
  ADD COLUMN IF NOT EXISTS cipher jsonb;

CREATE TABLE IF NOT EXISTS public.lesion_stage_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  condition text NOT NULL,
  classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  weights jsonb NOT NULL DEFAULT '[]'::jsonb,
  means jsonb NOT NULL DEFAULT '[]'::jsonb,
  scales jsonb NOT NULL DEFAULT '[]'::jsonb,
  samples integer NOT NULL DEFAULT 0,
  accuracy numeric,
  trained_by uuid,
  trained_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, condition)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesion_stage_models TO authenticated;
GRANT ALL ON public.lesion_stage_models TO service_role;
ALTER TABLE public.lesion_stage_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read lesion models"
ON public.lesion_stage_models FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.accessible_project_ids(auth.uid()) @> ARRAY[project_id]);

CREATE POLICY "Project members write lesion models"
ON public.lesion_stage_models FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.accessible_project_ids(auth.uid()) @> ARRAY[project_id]);

CREATE POLICY "Project members update lesion models"
ON public.lesion_stage_models FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.accessible_project_ids(auth.uid()) @> ARRAY[project_id])
WITH CHECK (public.is_admin(auth.uid()) OR public.accessible_project_ids(auth.uid()) @> ARRAY[project_id]);

CREATE POLICY "Admins delete lesion models"
ON public.lesion_stage_models FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_lesion_stage_models_updated_at
BEFORE UPDATE ON public.lesion_stage_models
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.safeguarding_vault_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  public_jwk jsonb NOT NULL,
  wrapped_private_key jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safeguarding_vault_keys TO authenticated;
GRANT ALL ON public.safeguarding_vault_keys TO service_role;
ALTER TABLE public.safeguarding_vault_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers read vault keys in their project"
ON public.safeguarding_vault_keys FOR SELECT TO authenticated
USING (public.is_safeguarding_officer(auth.uid(), project_id));

CREATE POLICY "Officers enrol their own vault key"
ON public.safeguarding_vault_keys FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_safeguarding_officer(auth.uid(), project_id));

CREATE POLICY "Officers update their own vault key"
ON public.safeguarding_vault_keys FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Officers remove their own vault key"
ON public.safeguarding_vault_keys FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER update_safeguarding_vault_keys_updated_at
BEFORE UPDATE ON public.safeguarding_vault_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.safeguarding_case_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  concern_id uuid NOT NULL REFERENCES public.safeguarding_concerns(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  sealed_key jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concern_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_safeguarding_case_keys_recipient
  ON public.safeguarding_case_keys (recipient_id, concern_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safeguarding_case_keys TO authenticated;
GRANT ALL ON public.safeguarding_case_keys TO service_role;
ALTER TABLE public.safeguarding_case_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their own case key"
ON public.safeguarding_case_keys FOR SELECT TO authenticated
USING (recipient_id = (SELECT auth.uid()) AND public.is_safeguarding_officer(auth.uid(), project_id));

CREATE POLICY "Officers seal case keys"
ON public.safeguarding_case_keys FOR INSERT TO authenticated
WITH CHECK (public.is_safeguarding_officer(auth.uid(), project_id));

CREATE POLICY "Officers replace case keys"
ON public.safeguarding_case_keys FOR UPDATE TO authenticated
USING (public.is_safeguarding_officer(auth.uid(), project_id))
WITH CHECK (public.is_safeguarding_officer(auth.uid(), project_id));

CREATE POLICY "Officers revoke case keys"
ON public.safeguarding_case_keys FOR DELETE TO authenticated
USING (public.is_safeguarding_officer(auth.uid(), project_id));
