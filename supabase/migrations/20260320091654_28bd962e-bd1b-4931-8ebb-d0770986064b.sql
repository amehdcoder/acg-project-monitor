
-- Table for tracking form completion timing, validation failures, skipped questions, field notes, and audio verification
CREATE TABLE public.form_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- 'validation_failure', 'question_skipped', 'form_timing', 'field_note', 'audio_verification', 'photo_metadata'
  event_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.form_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view all tracking events" ON public.form_tracking_events
  FOR SELECT TO authenticated USING (is_owner(auth.uid()));

CREATE POLICY "Granted admins can view tracking events" ON public.form_tracking_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_page_access WHERE user_id = auth.uid() AND page_id = 'surveillance')
  );

CREATE POLICY "Users can insert their own tracking events" ON public.form_tracking_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Table for app usage tracking (page visits, feature usage)
CREATE TABLE public.app_usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  action text NOT NULL DEFAULT 'page_view',
  session_id text,
  duration_seconds integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view all usage tracking" ON public.app_usage_tracking
  FOR SELECT TO authenticated USING (is_owner(auth.uid()));

CREATE POLICY "Granted admins can view usage tracking" ON public.app_usage_tracking
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_page_access WHERE user_id = auth.uid() AND page_id = 'surveillance')
  );

CREATE POLICY "Users can insert their own usage" ON public.app_usage_tracking
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Table for geofence breach alerts access control
CREATE TABLE public.geofence_alert_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.geofence_alert_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage geofence alert access" ON public.geofence_alert_access
  FOR ALL TO authenticated USING (is_owner(auth.uid())) WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Users can view their own access" ON public.geofence_alert_access
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for audio verification clips
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-verification', 'audio-verification', false);

CREATE POLICY "Admins can read audio verification" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'audio-verification' AND is_admin(auth.uid()));

CREATE POLICY "Users can upload audio verification" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-verification' AND auth.uid()::text = (storage.foldername(name))[1]);
