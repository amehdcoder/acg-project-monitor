-- 1. Co-owner flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_co_owner boolean NOT NULL DEFAULT false;

-- 2. Co-owner helper functions
CREATE OR REPLACE FUNCTION public.is_co_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND is_co_owner = true);
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_co_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner(_user_id) OR public.is_co_owner(_user_id);
$$;

-- 3. Co-owners count as admins (almost full rights)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'systems_admin')
  ) OR public.is_co_owner(_user_id);
$$;

-- 4. Co-owners get full page access
CREATE OR REPLACE FUNCTION public.has_page_access(_user_id uuid, _page_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_owner(_user_id)
    OR public.is_co_owner(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = _user_id AND page_id = _page_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_page_access
      WHERE user_id = _user_id
        AND page_id = _page_id
        AND public.is_assignment_active(starts_at, expires_at)
    );
$$;

-- 5. Guard: only the Owner may set/unset is_co_owner
CREATE OR REPLACE FUNCTION public.enforce_co_owner_grant_owner_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_co_owner, false) IS DISTINCT FROM COALESCE(OLD.is_co_owner, false) THEN
    IF NOT public.is_owner(auth.uid()) THEN
      RAISE EXCEPTION 'Only the Owner may grant or revoke Co-owner status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_co_owner ON public.profiles;
CREATE TRIGGER trg_enforce_co_owner
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_co_owner_grant_owner_only();

-- 6. Owner OR Co-owner can manage admin page access
DROP POLICY IF EXISTS "Owner can manage page access" ON public.admin_page_access;
CREATE POLICY "Owner can manage page access" ON public.admin_page_access
  FOR ALL USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

-- Also allow Owner/Co-owner to manage time-bounded user page access fully
DROP POLICY IF EXISTS "Owner manages user page access" ON public.user_page_access;
CREATE POLICY "Owner manages user page access" ON public.user_page_access
  FOR ALL USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

-- 7. Standard-forms visibility restrictions
CREATE TABLE IF NOT EXISTS public.standard_form_user_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  restricted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standard_form_user_restrictions TO authenticated;
GRANT ALL ON public.standard_form_user_restrictions TO service_role;
ALTER TABLE public.standard_form_user_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or Co-owner manage standard form restrictions"
  ON public.standard_form_user_restrictions
  FOR ALL USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

CREATE POLICY "Users can view their own standard form restriction"
  ON public.standard_form_user_restrictions
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_standard_forms_restricted(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.standard_form_user_restrictions WHERE user_id = _user_id
  ) AND NOT public.is_admin(_user_id);
$$;

-- 8. Restrict who can change a form (incl. its active/finalized status)
CREATE OR REPLACE FUNCTION public.can_manage_form(_user_id uuid, _form_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner_or_co_owner(_user_id)
    OR (
      public.is_admin(_user_id) AND (
        EXISTS (SELECT 1 FROM public.user_form_assignments WHERE form_id = _form_id AND user_id = _user_id)
        OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = _form_id AND f.created_by = _user_id)
        OR EXISTS (
          SELECT 1 FROM public.forms f
          JOIN public.user_project_assignments upa ON upa.project_id = f.project_id
          WHERE f.id = _form_id AND upa.user_id = _user_id
        )
      )
    );
$$;

DROP POLICY IF EXISTS "Admins can manage forms" ON public.forms;
CREATE POLICY "Admins can view all forms" ON public.forms
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can create forms" ON public.forms
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Form managers can update forms" ON public.forms
  FOR UPDATE USING (public.can_manage_form(auth.uid(), id))
  WITH CHECK (public.can_manage_form(auth.uid(), id));
CREATE POLICY "Form managers can delete forms" ON public.forms
  FOR DELETE USING (public.can_manage_form(auth.uid(), id));