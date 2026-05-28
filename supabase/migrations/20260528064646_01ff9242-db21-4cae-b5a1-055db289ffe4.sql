
-- 1) GPS override columns on microplan_entries
ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS settlement_lat_override double precision,
  ADD COLUMN IF NOT EXISTS settlement_lng_override double precision,
  ADD COLUMN IF NOT EXISTS community_lat_override  double precision,
  ADD COLUMN IF NOT EXISTS community_lng_override  double precision,
  ADD COLUMN IF NOT EXISTS flhf_lat_override       double precision,
  ADD COLUMN IF NOT EXISTS flhf_lng_override       double precision,
  ADD COLUMN IF NOT EXISTS gps_overridden_by       uuid,
  ADD COLUMN IF NOT EXISTS gps_overridden_at       timestamptz;

-- 2) Time-bound columns on existing assignment tables
ALTER TABLE public.user_form_assignments
  ADD COLUMN IF NOT EXISTS starts_at  timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.user_project_assignments
  ADD COLUMN IF NOT EXISTS starts_at  timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Helper
CREATE OR REPLACE FUNCTION public.is_assignment_active(_starts_at timestamptz, _expires_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (_starts_at IS NULL OR _starts_at <= now())
     AND (_expires_at IS NULL OR _expires_at >  now())
$$;

-- 3) user_page_access table
CREATE TABLE IF NOT EXISTS public.user_page_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  page_id     text NOT NULL,
  granted_by  uuid NOT NULL,
  starts_at   timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_page_access TO authenticated;
GRANT ALL ON public.user_page_access TO service_role;

ALTER TABLE public.user_page_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages all page grants"
  ON public.user_page_access
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Users view own page grants"
  ON public.user_page_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_page_access_user ON public.user_page_access(user_id);

-- 4) has_page_access security definer
CREATE OR REPLACE FUNCTION public.has_page_access(_user_id uuid, _page_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner(_user_id)
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

-- 5) mesh_signaling
CREATE TABLE IF NOT EXISTS public.mesh_signaling (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     text NOT NULL,
  from_peer   text NOT NULL,
  to_peer     text,
  kind        text NOT NULL CHECK (kind IN ('offer','answer','ice','hello','bye')),
  payload     jsonb NOT NULL,
  created_by  uuid NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '60 seconds')
);

GRANT SELECT, INSERT, DELETE ON public.mesh_signaling TO authenticated;
GRANT ALL ON public.mesh_signaling TO service_role;

ALTER TABLE public.mesh_signaling ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read recent signaling"
  ON public.mesh_signaling FOR SELECT TO authenticated
  USING (expires_at > now());

CREATE POLICY "Authenticated write own signaling"
  ON public.mesh_signaling FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated delete own signaling"
  ON public.mesh_signaling FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_mesh_signaling_room ON public.mesh_signaling(room_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.mesh_signaling;
