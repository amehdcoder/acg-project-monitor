CREATE TABLE public.offline_auth_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  email text,
  event_type text NOT NULL,
  success boolean,
  device_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.offline_auth_audit TO authenticated;
GRANT ALL ON public.offline_auth_audit TO service_role;

ALTER TABLE public.offline_auth_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can log their own offline audit events"
  ON public.offline_auth_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins and owners can view offline audit"
  ON public.offline_auth_audit
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

CREATE INDEX idx_offline_auth_audit_occurred ON public.offline_auth_audit (occurred_at DESC);
CREATE INDEX idx_offline_auth_audit_email ON public.offline_auth_audit (email);
CREATE INDEX idx_offline_auth_audit_event ON public.offline_auth_audit (event_type);