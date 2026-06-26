
-- Track form-to-project grants so we can keep per-user form access in sync
CREATE TABLE IF NOT EXISTS public.form_project_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  granted_by UUID,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_project_grants TO authenticated;
GRANT ALL ON public.form_project_grants TO service_role;

ALTER TABLE public.form_project_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and members can view project form grants"
  ON public.form_project_grants FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_project_assignments upa
      WHERE upa.project_id = form_project_grants.project_id
        AND upa.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage project form grants"
  ON public.form_project_grants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND (p.is_owner OR p.is_co_owner)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND (p.is_owner OR p.is_co_owner)
    )
  );

-- When a project-wide grant is created, fan it out to all current members.
CREATE OR REPLACE FUNCTION public.sync_form_grant_to_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_form_assignments (user_id, form_id, assigned_by, starts_at, expires_at)
  SELECT upa.user_id, NEW.form_id, NEW.granted_by, NEW.starts_at, NEW.expires_at
  FROM public.user_project_assignments upa
  WHERE upa.project_id = NEW.project_id
  ON CONFLICT (user_id, form_id) DO UPDATE
    SET starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_grant_to_members ON public.form_project_grants;
CREATE TRIGGER trg_sync_form_grant_to_members
  AFTER INSERT OR UPDATE ON public.form_project_grants
  FOR EACH ROW EXECUTE FUNCTION public.sync_form_grant_to_members();

-- When a user joins a project, grant them every project-wide form.
CREATE OR REPLACE FUNCTION public.sync_member_added_form_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_form_assignments (user_id, form_id, assigned_by, starts_at, expires_at)
  SELECT NEW.user_id, fpg.form_id, fpg.granted_by, fpg.starts_at, fpg.expires_at
  FROM public.form_project_grants fpg
  WHERE fpg.project_id = NEW.project_id
  ON CONFLICT (user_id, form_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_added_form_grants ON public.user_project_assignments;
CREATE TRIGGER trg_sync_member_added_form_grants
  AFTER INSERT ON public.user_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_added_form_grants();

-- When a user leaves a project, revoke forms granted via that project,
-- unless the same form is also granted through another of their projects.
CREATE OR REPLACE FUNCTION public.sync_member_removed_form_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_form_assignments ufa
  WHERE ufa.user_id = OLD.user_id
    AND ufa.form_id IN (
      SELECT fpg.form_id FROM public.form_project_grants fpg
      WHERE fpg.project_id = OLD.project_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.form_project_grants fpg2
      JOIN public.user_project_assignments upa2
        ON upa2.project_id = fpg2.project_id
      WHERE fpg2.form_id = ufa.form_id
        AND upa2.user_id = OLD.user_id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_removed_form_grants ON public.user_project_assignments;
CREATE TRIGGER trg_sync_member_removed_form_grants
  AFTER DELETE ON public.user_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_removed_form_grants();
