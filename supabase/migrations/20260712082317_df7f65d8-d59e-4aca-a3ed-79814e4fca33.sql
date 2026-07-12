-- Helper: is the user a dashboard administrator?
CREATE OR REPLACE FUNCTION public.is_dashboard_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user_id AND (p.is_owner OR p.is_co_owner))
    OR public.has_role(_user_id, 'super_admin')
    OR public.has_role(_user_id, 'systems_admin')
$$;

-- Shares table
CREATE TABLE public.dashboard_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  dashboard_id text NOT NULL,
  project_id uuid,
  access_type text NOT NULL DEFAULT 'internal_roles'
    CHECK (access_type IN ('public','external_emails','internal_roles')),
  allowed_emails text[] NOT NULL DEFAULT '{}',
  allowed_roles text[] NOT NULL DEFAULT '{}',
  label text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_shares TO authenticated;
GRANT ALL ON public.dashboard_shares TO service_role;

ALTER TABLE public.dashboard_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dashboard admins manage shares"
ON public.dashboard_shares FOR ALL TO authenticated
USING (public.is_dashboard_admin(auth.uid()))
WITH CHECK (public.is_dashboard_admin(auth.uid()));

-- OTP codes table (backend/service-only)
CREATE TABLE public.dashboard_share_otps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id uuid NOT NULL REFERENCES public.dashboard_shares(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.dashboard_share_otps TO service_role;

ALTER TABLE public.dashboard_share_otps ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only the service role (edge function) touches this table.

CREATE INDEX idx_dashboard_share_otps_lookup
  ON public.dashboard_share_otps (share_id, email, consumed);

-- updated_at trigger
CREATE TRIGGER update_dashboard_shares_updated_at
BEFORE UPDATE ON public.dashboard_shares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();