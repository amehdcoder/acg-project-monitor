CREATE TABLE public.sms_settings (
  project_id uuid PRIMARY KEY,
  gateway_url text NOT NULL DEFAULT 'https://api.sms-gate.app/3rdparty/v1',
  username text,
  password text,
  project_label text DEFAULT 'HANDS',
  message_upcoming text,
  message_overdue text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sms_settings TO service_role;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sms_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  beneficiary_id uuid,
  kind text NOT NULL,
  phone text,
  status text NOT NULL,
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_notification_log TO authenticated;
GRANT ALL ON public.sms_notification_log TO service_role;
ALTER TABLE public.sms_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read sms log" ON public.sms_notification_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX ON public.sms_notification_log (project_id, created_at DESC);

ALTER TABLE public.followup_reminders
  ADD COLUMN sms_reminder_2d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN sms_reminder_1d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN sms_reminder_day_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN sms_overdue_sent boolean NOT NULL DEFAULT false;