
-- =========================================================
-- CES Roles + Fenced Communities + Peer Validations
-- =========================================================

-- 1) Role assignments per (user, project)
CREATE TABLE IF NOT EXISTS public.ces_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('community_locator','household_surveyor','peer_validator')),
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, role)
);
CREATE INDEX IF NOT EXISTS idx_ces_role_assignments_user ON public.ces_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ces_role_assignments_project ON public.ces_role_assignments(project_id);

ALTER TABLE public.ces_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ces_roles: owner/admin manage all"
  ON public.ces_role_assignments FOR ALL
  TO authenticated
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "ces_roles: users see their own"
  ON public.ces_role_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) Helper functions
CREATE OR REPLACE FUNCTION public.has_ces_role(_user_id uuid, _project_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ces_role_assignments
    WHERE user_id = _user_id AND project_id = _project_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.can_locate_community(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.is_owner(_user_id)
      OR public.has_ces_role(_user_id, _project_id, 'community_locator');
$$;

CREATE OR REPLACE FUNCTION public.can_survey_households(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.is_owner(_user_id)
      OR public.has_ces_role(_user_id, _project_id, 'household_surveyor')
      OR public.has_ces_role(_user_id, _project_id, 'community_locator');
$$;

CREATE OR REPLACE FUNCTION public.can_peer_validate_survey(_user_id uuid, _survey_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ces_surveys s
    WHERE s.id = _survey_id
      AND s.created_by <> _user_id
      AND (
        public.is_admin(_user_id)
        OR public.is_owner(_user_id)
        OR public.has_ces_role(_user_id, s.project_id, 'peer_validator')
      )
  );
$$;

-- 3) Fenced communities (canonical list created by locators)
CREATE TABLE IF NOT EXISTS public.ces_fenced_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  state text,
  lga text,
  ward text,
  flhf_name text,
  community_name text NOT NULL,
  settlement_name text,
  center_lat double precision,
  center_lng double precision,
  perimeter_coords jsonb NOT NULL DEFAULT '[]'::jsonb,
  area_m2 numeric,
  source_session_id uuid,
  source_survey_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fenced_communities_project_geo
  ON public.ces_fenced_communities(project_id, state, lga, ward);
CREATE INDEX IF NOT EXISTS idx_fenced_communities_created_at
  ON public.ces_fenced_communities(created_at DESC);

ALTER TABLE public.ces_fenced_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fenced: authenticated read"
  ON public.ces_fenced_communities FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "fenced: locators or admin insert"
  ON public.ces_fenced_communities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.can_locate_community(auth.uid(), project_id));

CREATE POLICY "fenced: creator or admin update"
  ON public.ces_fenced_communities FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "fenced: creator or admin delete"
  ON public.ces_fenced_communities FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_fenced_communities_updated_at
  BEFORE UPDATE ON public.ces_fenced_communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Peer validations
CREATE TABLE IF NOT EXISTS public.ces_peer_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL,
  validator_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('revisit','desk_review')),
  verdict text NOT NULL CHECK (verdict IN ('confirmed','disputed','needs_resample')),
  households_revisited integer DEFAULT 0,
  households_agreed integer DEFAULT 0,
  agreement_pct numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_peer_validations_survey ON public.ces_peer_validations(survey_id);
CREATE INDEX IF NOT EXISTS idx_peer_validations_validator ON public.ces_peer_validations(validator_id);

ALTER TABLE public.ces_peer_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_val: validator/creator/admin read"
  ON public.ces_peer_validations FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR auth.uid() = validator_id
    OR EXISTS (SELECT 1 FROM public.ces_surveys s WHERE s.id = survey_id AND s.created_by = auth.uid())
  );

CREATE POLICY "peer_val: eligible validator insert"
  ON public.ces_peer_validations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = validator_id
    AND public.can_peer_validate_survey(auth.uid(), survey_id)
  );

CREATE POLICY "peer_val: validator or admin update"
  ON public.ces_peer_validations FOR UPDATE
  TO authenticated
  USING (auth.uid() = validator_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = validator_id OR public.is_admin(auth.uid()));

CREATE POLICY "peer_val: validator or admin delete"
  ON public.ces_peer_validations FOR DELETE
  TO authenticated
  USING (auth.uid() = validator_id OR public.is_admin(auth.uid()));

-- 5) Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_fenced_communities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_peer_validations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ces_role_assignments;
