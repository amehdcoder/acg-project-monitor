
-- 1) Revoke anonymous/public EXECUTE on SECURITY DEFINER helpers in public schema,
--    keeping the few routines the signed-out sign-in screen legitimately needs.
DO $$
DECLARE
  r record;
  keep text[] := ARRAY['is_email_deleted','record_inactive_login_attempt','log_client_error'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    IF NOT (r.proname = ANY(keep)) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;

-- 2) Owner email registry: removes the hardcoded personal address from the
--    signup trigger. Service role only; no anon/authenticated grants.
CREATE TABLE IF NOT EXISTS public.owner_emails (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.owner_emails TO service_role;

ALTER TABLE public.owner_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages owner emails" ON public.owner_emails;
CREATE POLICY "Service role manages owner emails"
  ON public.owner_emails FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.owner_emails (email)
VALUES ('amehjoey1@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_owner_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_emails
    WHERE lower(email) = lower(coalesce(_email, ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner_email(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_email(text) TO authenticated, service_role;
