
CREATE TABLE IF NOT EXISTS public.kobo_webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  rotated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS kobo_webhook_secrets_active_idx
  ON public.kobo_webhook_secrets (active, created_at DESC);

GRANT SELECT ON public.kobo_webhook_secrets TO authenticated;
GRANT ALL ON public.kobo_webhook_secrets TO service_role;

ALTER TABLE public.kobo_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook secret history"
  ON public.kobo_webhook_secrets FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR public.is_owner_level(auth.uid())
  );
