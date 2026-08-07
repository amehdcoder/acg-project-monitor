CREATE TABLE public.mda_lens_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  page text,
  tab text,
  access_granted boolean,
  grant_state text,
  latency_ms integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, SELECT ON public.mda_lens_access_events TO authenticated;
GRANT ALL ON public.mda_lens_access_events TO service_role;

ALTER TABLE public.mda_lens_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users log their own lens access events"
ON public.mda_lens_access_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read lens access events"
ON public.mda_lens_access_events FOR SELECT TO authenticated
USING (public.is_owner_level(auth.uid()) OR public.is_admin(auth.uid()));

CREATE INDEX idx_mda_lens_events_created ON public.mda_lens_access_events (created_at DESC);
CREATE INDEX idx_mda_lens_events_user ON public.mda_lens_access_events (user_id, created_at DESC);
CREATE INDEX idx_mda_lens_events_type ON public.mda_lens_access_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_mda_lens_access_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.mda_lens_access_events WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.prune_mda_lens_access_events() FROM public, anon;