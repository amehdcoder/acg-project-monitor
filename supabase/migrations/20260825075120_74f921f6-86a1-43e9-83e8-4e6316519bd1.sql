ALTER TABLE public.user_page_access
  ADD COLUMN IF NOT EXISTS scope_states text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.checklist_dashboard_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  server_url text NOT NULL DEFAULT 'https://kf.kobotoolbox.org',
  form_uid text NOT NULL UNIQUE,
  api_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_dashboard_feeds TO authenticated;
GRANT ALL ON public.checklist_dashboard_feeds TO service_role;

ALTER TABLE public.checklist_dashboard_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage checklist dashboard feeds"
  ON public.checklist_dashboard_feeds
  FOR ALL
  TO authenticated
  USING (public.is_owner_level(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'systems_admin'::app_role))
  WITH CHECK (public.is_owner_level(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'systems_admin'::app_role));

CREATE TRIGGER checklist_dashboard_feeds_touch
  BEFORE UPDATE ON public.checklist_dashboard_feeds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Checklist grantees view kobo sync events"
  ON public.kobo_sync_events
  FOR SELECT
  TO authenticated
  USING (public.has_page_access(auth.uid(), 'integrated-supervisory'));