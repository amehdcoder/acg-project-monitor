-- Scalability hardening: index the highest-volume realtime/tracking tables so
-- queries stay fast under millions of concurrent users and very large row counts.

-- High-volume usage telemetry (heartbeat / page tracking)
CREATE INDEX IF NOT EXISTS idx_app_usage_user_created ON public.app_usage_tracking (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_usage_session ON public.app_usage_tracking (session_id);
CREATE INDEX IF NOT EXISTS idx_app_usage_created ON public.app_usage_tracking (created_at DESC);

-- Device sessions (looked up per-user and by session, filtered by active state)
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_lastseen ON public.device_sessions (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_sessions_session ON public.device_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_active ON public.device_sessions (user_id) WHERE is_active = true;

-- Generic form submissions (dashboards filter by time, status, user, form)
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON public.form_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON public.form_submissions (status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_created ON public.form_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_created ON public.form_submissions (form_id, created_at DESC);

-- Form tracking events (high write volume, queried per form/submission/user)
CREATE INDEX IF NOT EXISTS idx_form_tracking_form_created ON public.form_tracking_events (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_tracking_submission ON public.form_tracking_events (submission_id);
CREATE INDEX IF NOT EXISTS idx_form_tracking_user ON public.form_tracking_events (user_id);