
CREATE TABLE public.programme_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_template boolean NOT NULL DEFAULT false,
  case_seq bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_modules TO authenticated;
GRANT ALL ON public.programme_modules TO service_role;
ALTER TABLE public.programme_modules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_programme_modules_project ON public.programme_modules(project_id);

CREATE POLICY "Project members view programme modules" ON public.programme_modules
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Admins create programme modules" ON public.programme_modules
FOR INSERT TO authenticated WITH CHECK (
  public.is_admin((SELECT auth.uid())) AND created_by = (SELECT auth.uid())
);
CREATE POLICY "Admins update programme modules" ON public.programme_modules
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())))
WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins delete programme modules" ON public.programme_modules
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

CREATE TABLE public.beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  case_id text NOT NULL,
  full_name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  risk_level text,
  photo_url text,
  latitude double precision,
  longitude double precision,
  state text,
  lga text,
  ward text,
  village text,
  next_follow_up_date date,
  submission_uuid uuid,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT ALL ON public.beneficiaries TO service_role;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX beneficiaries_module_case_id_key ON public.beneficiaries(module_id, case_id);
CREATE UNIQUE INDEX beneficiaries_submission_uuid_key ON public.beneficiaries(submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE INDEX idx_beneficiaries_module ON public.beneficiaries(module_id, created_at DESC);
CREATE INDEX idx_beneficiaries_project ON public.beneficiaries(project_id);

CREATE POLICY "Project members view beneficiaries" ON public.beneficiaries
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create beneficiaries" ON public.beneficiaries
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Project members update beneficiaries" ON public.beneficiaries
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Admins delete beneficiaries" ON public.beneficiaries
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

CREATE TABLE public.beneficiary_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  service_name text,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  result text,
  status text NOT NULL DEFAULT 'on_track',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_uuid uuid,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_services TO authenticated;
GRANT ALL ON public.beneficiary_services TO service_role;
ALTER TABLE public.beneficiary_services ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX beneficiary_services_submission_uuid_key ON public.beneficiary_services(submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE INDEX idx_beneficiary_services_beneficiary ON public.beneficiary_services(beneficiary_id, service_date DESC);

CREATE POLICY "Project members view services" ON public.beneficiary_services
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create services" ON public.beneficiary_services
FOR INSERT TO authenticated WITH CHECK (
  recorded_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Recorders update services" ON public.beneficiary_services
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR recorded_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR recorded_by = (SELECT auth.uid()));
CREATE POLICY "Recorders delete services" ON public.beneficiary_services
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())) OR recorded_by = (SELECT auth.uid()));

CREATE TABLE public.beneficiary_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  component_key text,
  referred_to text NOT NULL,
  reason text,
  referral_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'initiated',
  notes text,
  submission_uuid uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_referrals TO authenticated;
GRANT ALL ON public.beneficiary_referrals TO service_role;
ALTER TABLE public.beneficiary_referrals ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX beneficiary_referrals_submission_uuid_key ON public.beneficiary_referrals(submission_uuid) WHERE submission_uuid IS NOT NULL;
CREATE INDEX idx_beneficiary_referrals_beneficiary ON public.beneficiary_referrals(beneficiary_id, referral_date DESC);

CREATE POLICY "Project members view referrals" ON public.beneficiary_referrals
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members create referrals" ON public.beneficiary_referrals
FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);
CREATE POLICY "Creators update referrals" ON public.beneficiary_referrals
FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));
CREATE POLICY "Creators delete referrals" ON public.beneficiary_referrals
FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())) OR created_by = (SELECT auth.uid()));

CREATE TABLE public.beneficiary_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.beneficiary_audit TO authenticated;
GRANT ALL ON public.beneficiary_audit TO service_role;
ALTER TABLE public.beneficiary_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_beneficiary_audit_beneficiary ON public.beneficiary_audit(beneficiary_id, created_at DESC);

CREATE POLICY "Project members view beneficiary audit" ON public.beneficiary_audit
FOR SELECT TO authenticated USING (
  public.is_admin((SELECT auth.uid()))
  OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Project members write beneficiary audit" ON public.beneficiary_audit
FOR INSERT TO authenticated WITH CHECK (
  actor_id = (SELECT auth.uid())
  AND (public.is_admin((SELECT auth.uid()))
       OR project_id IN (SELECT upa.project_id FROM public.user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
);

CREATE TRIGGER update_programme_modules_updated_at BEFORE UPDATE ON public.programme_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_beneficiaries_updated_at BEFORE UPDATE ON public.beneficiaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_beneficiary_services_updated_at BEFORE UPDATE ON public.beneficiary_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_beneficiary_referrals_updated_at BEFORE UPDATE ON public.beneficiary_referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.next_beneficiary_case_id(_module_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cfg jsonb;
  _seq bigint;
  _prefix text;
  _width int;
  _include_year boolean;
BEGIN
  UPDATE public.programme_modules
     SET case_seq = case_seq + 1
   WHERE id = _module_id
  RETURNING case_seq, config INTO _seq, _cfg;

  IF _seq IS NULL THEN
    RAISE EXCEPTION 'Programme module % not found', _module_id;
  END IF;

  _prefix := COALESCE(NULLIF(_cfg #>> '{caseId,prefix}', ''), 'CASE');
  _width := COALESCE((_cfg #>> '{caseId,width}')::int, 6);
  _include_year := COALESCE((_cfg #>> '{caseId,includeYear}')::boolean, true);

  IF _include_year THEN
    RETURN _prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(_seq::text, _width, '0');
  END IF;
  RETURN _prefix || '-' || lpad(_seq::text, _width, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_beneficiary_case_id(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid) TO authenticated, service_role;
