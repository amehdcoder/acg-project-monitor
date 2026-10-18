-- Per-project Meta WhatsApp Cloud API settings. Token is server-only (no browser grant on the table).
CREATE TABLE public.whatsapp_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  access_token text,
  phone_number_id text,
  business_account_id text,
  template_upcoming text NOT NULL DEFAULT 'follow_up_upcoming',
  template_overdue text NOT NULL DEFAULT 'follow_up_overdue',
  template_language text NOT NULL DEFAULT 'en',
  project_label text NOT NULL DEFAULT 'Accelerate Project',
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- Tracking per scheduled follow-up visit, prevents duplicate notifications.
CREATE TABLE public.followup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  reminder_2d_sent boolean NOT NULL DEFAULT false,
  reminder_1d_sent boolean NOT NULL DEFAULT false,
  reminder_day_sent boolean NOT NULL DEFAULT false,
  overdue_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficiary_id, scheduled_date)
);
GRANT SELECT ON public.followup_reminders TO authenticated;
GRANT ALL ON public.followup_reminders TO service_role;
ALTER TABLE public.followup_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read reminder tracking" ON public.followup_reminders FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.whatsapp_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  beneficiary_id uuid,
  kind text NOT NULL,
  phone text,
  status text NOT NULL,
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_notification_log_project_idx ON public.whatsapp_notification_log (project_id, created_at DESC);
GRANT SELECT ON public.whatsapp_notification_log TO authenticated;
GRANT ALL ON public.whatsapp_notification_log TO service_role;
ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp log" ON public.whatsapp_notification_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));