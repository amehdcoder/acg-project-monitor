CREATE TABLE public.programme_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  module_id uuid REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  team_type text NOT NULL DEFAULT 'state',
  organisation text,
  unit text,
  designation text,
  state text,
  lga text,
  ward text,
  facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_team_members TO authenticated;
GRANT ALL ON public.programme_team_members TO service_role;

ALTER TABLE public.programme_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members readable by project people"
ON public.programme_team_members FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Admins and team managers add members"
ON public.programme_team_members FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.programme_team_members m
    WHERE m.project_id = programme_team_members.project_id
      AND m.user_id = auth.uid()
      AND m.is_active
      AND COALESCE((m.permissions ->> 'manage_team')::boolean, false)
  )
);

CREATE POLICY "Admins and team managers update members"
ON public.programme_team_members FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.programme_team_members m
    WHERE m.project_id = programme_team_members.project_id
      AND m.user_id = auth.uid()
      AND m.is_active
      AND COALESCE((m.permissions ->> 'manage_team')::boolean, false)
  )
);

CREATE POLICY "Admins and team managers remove members"
ON public.programme_team_members FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.programme_team_members m
    WHERE m.project_id = programme_team_members.project_id
      AND m.user_id = auth.uid()
      AND m.is_active
      AND COALESCE((m.permissions ->> 'manage_team')::boolean, false)
  )
);

CREATE INDEX idx_programme_team_project ON public.programme_team_members(project_id);
CREATE INDEX idx_programme_team_user ON public.programme_team_members(user_id);
CREATE INDEX idx_programme_team_facility ON public.programme_team_members(facility_id);

CREATE TRIGGER update_programme_team_members_updated_at
BEFORE UPDATE ON public.programme_team_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();