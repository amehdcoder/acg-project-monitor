
-- ============ Account audit log ============
CREATE TABLE public.account_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,            -- 'account_created' | 'account_approved' | 'profile_upserted' | 'orphan_repaired' | 'orphan_flagged' | 'retry_enqueued' | 'retry_succeeded' | 'retry_failed'
  actor_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  success boolean NOT NULL DEFAULT true,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_audit_log_target ON public.account_audit_log (target_email);
CREATE INDEX idx_account_audit_log_created ON public.account_audit_log (created_at DESC);

GRANT SELECT ON public.account_audit_log TO authenticated;
GRANT ALL ON public.account_audit_log TO service_role;

ALTER TABLE public.account_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read account audit log"
  ON public.account_audit_log FOR SELECT
  TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

-- ============ Account creation retry queue ============
CREATE TABLE public.account_creation_retry_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT 'data_collector',
  designation_label text,
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending',  -- pending | processing | succeeded | failed | abandoned
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_retry_queue_status ON public.account_creation_retry_queue (status, next_retry_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_creation_retry_queue TO authenticated;
GRANT ALL ON public.account_creation_retry_queue TO service_role;

ALTER TABLE public.account_creation_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage retry queue"
  ON public.account_creation_retry_queue FOR ALL
  TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_retry_queue_updated_at
  BEFORE UPDATE ON public.account_creation_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
