-- Opt-in flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_tracking_enabled boolean NOT NULL DEFAULT false;

-- Helper: who can view ALL user locations
CREATE OR REPLACE FUNCTION public.can_view_all_locations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_owner(_user_id)
      OR public.is_co_owner(_user_id)
      OR public.has_role(_user_id, 'super_admin');
$$;

-- Locations table
CREATE TABLE public.locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  altitude double precision,
  battery_level double precision,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_locations_user_recorded ON public.locations (user_id, recorded_at DESC);
CREATE INDEX idx_locations_recorded ON public.locations (recorded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own locations"
  ON public.locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own locations"
  ON public.locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all locations"
  ON public.locations FOR SELECT TO authenticated
  USING (public.can_view_all_locations(auth.uid()));

CREATE POLICY "Users delete their own locations"
  ON public.locations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.can_view_all_locations(auth.uid()));

-- Realtime
ALTER TABLE public.locations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;