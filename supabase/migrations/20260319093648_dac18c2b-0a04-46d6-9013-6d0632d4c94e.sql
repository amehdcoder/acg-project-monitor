
CREATE TABLE public.admin_surveillance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action_type text NOT NULL,
  action_description text NOT NULL,
  target_entity text,
  target_id text,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_surveillance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view surveillance logs"
ON public.admin_surveillance_log
FOR SELECT
TO authenticated
USING (is_owner(auth.uid()));

CREATE POLICY "Admins can insert surveillance logs"
ON public.admin_surveillance_log
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));
