-- 1. Who may handle safeguarding on a project ------------------------------
CREATE TABLE public.safeguarding_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'safeguarding_officer',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safeguarding_officers TO authenticated;
GRANT ALL ON public.safeguarding_officers TO service_role;
ALTER TABLE public.safeguarding_officers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_safeguarding_officer(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.safeguarding_officers o
    WHERE o.user_id = _user_id AND o.project_id = _project_id AND o.is_active
  )
$$;

CREATE POLICY "Admins manage safeguarding officers"
  ON public.safeguarding_officers FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())) AND user_id <> (SELECT auth.uid()));

CREATE POLICY "Officers see their own appointment"
  ON public.safeguarding_officers FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Restricted safeguarding concerns ---------------------------------------
CREATE TABLE public.safeguarding_concerns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid,
  beneficiary_id uuid REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
  beneficiary_label text,
  facility_id uuid,
  concern_date date NOT NULL DEFAULT CURRENT_DATE,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text NOT NULL DEFAULT 'moderate',
  immediate_action text,
  narrative text NOT NULL,
  action_taken text,
  referral_made jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent_obtained text,
  status text NOT NULL DEFAULT 'open',
  outcome text,
  closed_at timestamptz,
  reported_by uuid,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_safeguarding_concerns_project ON public.safeguarding_concerns (project_id, created_at DESC);
CREATE INDEX idx_safeguarding_concerns_beneficiary ON public.safeguarding_concerns (beneficiary_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safeguarding_concerns TO authenticated;
GRANT ALL ON public.safeguarding_concerns TO service_role;
ALTER TABLE public.safeguarding_concerns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Safeguarding officers read concerns"
  ON public.safeguarding_concerns FOR SELECT TO authenticated
  USING (public.is_safeguarding_officer((SELECT auth.uid()), project_id));

CREATE POLICY "Safeguarding officers log concerns"
  ON public.safeguarding_concerns FOR INSERT TO authenticated
  WITH CHECK (
    public.is_safeguarding_officer((SELECT auth.uid()), project_id)
    AND reported_by = (SELECT auth.uid())
  );

CREATE POLICY "Safeguarding officers update concerns"
  ON public.safeguarding_concerns FOR UPDATE TO authenticated
  USING (public.is_safeguarding_officer((SELECT auth.uid()), project_id))
  WITH CHECK (public.is_safeguarding_officer((SELECT auth.uid()), project_id));

-- 3. Case notes --------------------------------------------------------------
CREATE TABLE public.safeguarding_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concern_id uuid NOT NULL REFERENCES public.safeguarding_concerns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  note text NOT NULL,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_safeguarding_notes_concern ON public.safeguarding_notes (concern_id, created_at DESC);

GRANT SELECT, INSERT ON public.safeguarding_notes TO authenticated;
GRANT ALL ON public.safeguarding_notes TO service_role;
ALTER TABLE public.safeguarding_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Safeguarding officers read notes"
  ON public.safeguarding_notes FOR SELECT TO authenticated
  USING (public.is_safeguarding_officer((SELECT auth.uid()), project_id));

CREATE POLICY "Safeguarding officers add notes"
  ON public.safeguarding_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_safeguarding_officer((SELECT auth.uid()), project_id)
    AND author_id = (SELECT auth.uid())
  );

-- 4. Access log --------------------------------------------------------------
CREATE TABLE public.safeguarding_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  concern_id uuid,
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.safeguarding_access_log TO authenticated;
GRANT ALL ON public.safeguarding_access_log TO service_role;
ALTER TABLE public.safeguarding_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Safeguarding officers read the access log"
  ON public.safeguarding_access_log FOR SELECT TO authenticated
  USING (public.is_safeguarding_officer((SELECT auth.uid()), project_id));

CREATE POLICY "Safeguarding officers write the access log"
  ON public.safeguarding_access_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_safeguarding_officer((SELECT auth.uid()), project_id)
    AND user_id = (SELECT auth.uid())
  );

-- 5. Timestamps --------------------------------------------------------------
CREATE TRIGGER update_safeguarding_officers_updated_at
  BEFORE UPDATE ON public.safeguarding_officers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_safeguarding_concerns_updated_at
  BEFORE UPDATE ON public.safeguarding_concerns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();