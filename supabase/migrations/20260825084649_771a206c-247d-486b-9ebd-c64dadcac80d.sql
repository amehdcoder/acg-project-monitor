CREATE TABLE public.checklist_feed_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  feed_id uuid,
  feed_name text,
  form_uid text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,
  page_id text,
  previous_scope_states text[],
  new_scope_states text[],
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.checklist_feed_audit TO authenticated;
GRANT ALL ON public.checklist_feed_audit TO service_role;

ALTER TABLE public.checklist_feed_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_feed_audit_admin_read"
ON public.checklist_feed_audit
FOR SELECT
TO authenticated
USING (
  public.is_owner(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'systems_admin'::app_role)
);

CREATE INDEX idx_checklist_feed_audit_created_at ON public.checklist_feed_audit (created_at DESC);
CREATE INDEX idx_checklist_feed_audit_target ON public.checklist_feed_audit (target_user_id);