-- 1. Inactive login attempts audit table
CREATE TABLE public.inactive_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  attempted_user_id UUID,
  reason TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'online',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inactive_login_attempts_email ON public.inactive_login_attempts (email);
CREATE INDEX idx_inactive_login_attempts_created_at ON public.inactive_login_attempts (created_at DESC);
CREATE INDEX idx_inactive_login_attempts_user_id ON public.inactive_login_attempts (attempted_user_id);

GRANT SELECT, INSERT, DELETE ON public.inactive_login_attempts TO authenticated;
GRANT INSERT ON public.inactive_login_attempts TO anon;
GRANT ALL ON public.inactive_login_attempts TO service_role;

ALTER TABLE public.inactive_login_attempts ENABLE ROW LEVEL SECURITY;

-- Anyone can record a blocked attempt (including unauthenticated users at sign-in)
CREATE POLICY "Anyone can record inactive login attempts"
  ON public.inactive_login_attempts
  FOR INSERT
  WITH CHECK (true);

-- Only admins/owner can read
CREATE POLICY "Admins can view inactive login attempts"
  ON public.inactive_login_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- Only admins/owner can delete (cleanup)
CREATE POLICY "Admins can delete inactive login attempts"
  ON public.inactive_login_attempts
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- 2. Guard trigger: only true Owner may hold super_admin role
CREATE OR REPLACE FUNCTION public.enforce_super_admin_owner_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_is_owner BOOLEAN;
BEGIN
  IF NEW.role = 'super_admin' THEN
    SELECT email, is_owner INTO v_email, v_is_owner
    FROM public.profiles
    WHERE user_id = NEW.user_id;

    IF NOT (COALESCE(v_is_owner, false) = true OR v_email = 'amehjoey1@gmail.com') THEN
      INSERT INTO public.inactive_login_attempts (email, attempted_user_id, reason, mode, metadata)
      VALUES (
        COALESCE(v_email, 'unknown'),
        NEW.user_id,
        'super_admin_grant_blocked',
        'role_guard',
        jsonb_build_object(
          'attempted_role', NEW.role,
          'actor_id', auth.uid()
        )
      );
      RAISE EXCEPTION 'Only the true Owner account can hold the super_admin role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_super_admin_owner_only ON public.user_roles;
CREATE TRIGGER trg_enforce_super_admin_owner_only
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_super_admin_owner_only();

-- 3. Guard trigger: prevent flipping is_owner=true on the profiles table for anyone other than the true owner email
CREATE OR REPLACE FUNCTION public.enforce_is_owner_email_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_owner = true AND NEW.email <> 'amehjoey1@gmail.com' THEN
    INSERT INTO public.inactive_login_attempts (email, attempted_user_id, reason, mode, metadata)
    VALUES (
      COALESCE(NEW.email, 'unknown'),
      NEW.user_id,
      'is_owner_grant_blocked',
      'role_guard',
      jsonb_build_object('actor_id', auth.uid())
    );
    RAISE EXCEPTION 'is_owner can only be set on the true Owner email';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_is_owner_email_match ON public.profiles;
CREATE TRIGGER trg_enforce_is_owner_email_match
  BEFORE INSERT OR UPDATE OF is_owner, email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_is_owner_email_match();