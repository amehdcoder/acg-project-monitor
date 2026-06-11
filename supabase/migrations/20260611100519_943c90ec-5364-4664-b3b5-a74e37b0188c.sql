CREATE TABLE public.account_creation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  designation text,
  designation_label text,
  account_created boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_creation_log TO authenticated;
GRANT ALL ON public.account_creation_log TO service_role;

ALTER TABLE public.account_creation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and admins can view account creation history"
ON public.account_creation_log FOR SELECT TO authenticated
USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Owner and admins can delete account creation history"
ON public.account_creation_log FOR DELETE TO authenticated
USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE TABLE public.account_creation_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  log_id uuid NOT NULL REFERENCES public.account_creation_log(id) ON DELETE CASCADE,
  subject text,
  html text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_creation_emails TO authenticated;
GRANT ALL ON public.account_creation_emails TO service_role;

ALTER TABLE public.account_creation_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only owner can view sent email bodies"
ON public.account_creation_emails FOR SELECT TO authenticated
USING (public.is_owner(auth.uid()));

CREATE POLICY "Owner can delete sent email bodies"
ON public.account_creation_emails FOR DELETE TO authenticated
USING (public.is_owner(auth.uid()));