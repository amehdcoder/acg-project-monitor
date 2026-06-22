CREATE TABLE public.bloomberg_local_form_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id text NOT NULL DEFAULT '',
  device_label text,
  drafts integer NOT NULL DEFAULT 0,
  ready_to_send integer NOT NULL DEFAULT 0,
  submitted integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloomberg_local_form_audit TO authenticated;
GRANT ALL ON public.bloomberg_local_form_audit TO service_role;

ALTER TABLE public.bloomberg_local_form_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own device audit"
ON public.bloomberg_local_form_audit
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and owners view all device audit"
ON public.bloomberg_local_form_audit
FOR SELECT
USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE TRIGGER update_bloomberg_local_form_audit_updated_at
BEFORE UPDATE ON public.bloomberg_local_form_audit
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();