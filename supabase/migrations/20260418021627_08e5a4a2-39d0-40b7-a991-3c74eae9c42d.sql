-- Mesh sync: allow Form Systems Admins / Super Admins to designate trusted relay users
-- A designated relay user can receive form_submissions from peers via Bluetooth/WiFi Direct
-- and forward them to the server when they reach connectivity.

CREATE TABLE IF NOT EXISTS public.mesh_sync_relays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.mesh_sync_relays ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see who the relays are (so they know who to share with)
CREATE POLICY "Anyone authenticated can view relays"
  ON public.mesh_sync_relays
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can grant/revoke
CREATE POLICY "Admins can insert relays"
  ON public.mesh_sync_relays
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update relays"
  ON public.mesh_sync_relays
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete relays"
  ON public.mesh_sync_relays
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Audit table: when a relay forwards another user's submission
CREATE TABLE IF NOT EXISTS public.mesh_sync_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_user_id uuid NOT NULL,
  origin_user_id uuid NOT NULL,
  submission_id uuid,
  transport text NOT NULL DEFAULT 'bluetooth', -- bluetooth | wifi_direct | manual
  payload_size_bytes integer,
  forwarded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mesh_sync_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Relay can insert their own transfers"
  ON public.mesh_sync_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = relay_user_id);

CREATE POLICY "Admins and involved users can view transfers"
  ON public.mesh_sync_transfers
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR auth.uid() = relay_user_id OR auth.uid() = origin_user_id);

CREATE TRIGGER update_mesh_sync_relays_updated_at
  BEFORE UPDATE ON public.mesh_sync_relays
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();