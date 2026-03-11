
-- Device sessions table to track login history
CREATE TABLE public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  device_type text NOT NULL DEFAULT 'Unknown',
  device_description text NOT NULL DEFAULT 'Unknown Device',
  ip_address text,
  user_agent text,
  browser text,
  os text,
  screen_resolution text,
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view their own sessions"
  ON public.device_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
  ON public.device_sessions FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Users can insert their own sessions
CREATE POLICY "Users can insert their own sessions"
  ON public.device_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update their own sessions"
  ON public.device_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can update any session (for revoking)
CREATE POLICY "Admins can update any session"
  ON public.device_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admins can delete sessions
CREATE POLICY "Admins can delete sessions"
  ON public.device_sessions FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
