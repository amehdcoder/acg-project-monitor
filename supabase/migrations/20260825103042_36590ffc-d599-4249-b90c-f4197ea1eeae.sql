-- 1. Granular permissions on each admin page grant
ALTER TABLE public.admin_page_access
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.admin_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  target_user_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('grant', 'revoke', 'permissions_changed')),
  old_permissions jsonb,
  new_permissions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_access_audit TO authenticated;
GRANT ALL ON public.admin_access_audit TO service_role;

ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_access_audit_owner_read" ON public.admin_access_audit;
CREATE POLICY "admin_access_audit_owner_read"
  ON public.admin_access_audit FOR SELECT TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_page_created
  ON public.admin_access_audit (page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_audit_target
  ON public.admin_access_audit (target_user_id, created_at DESC);

-- 3. Trigger that records every grant / permission change / revoke
CREATE OR REPLACE FUNCTION public.log_admin_page_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_access_audit (page_id, target_user_id, actor_user_id, action, old_permissions, new_permissions)
    VALUES (NEW.page_id, NEW.user_id, COALESCE(auth.uid(), NEW.granted_by), 'grant', NULL, NEW.permissions);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
      NEW.updated_at := now();
      INSERT INTO public.admin_access_audit (page_id, target_user_id, actor_user_id, action, old_permissions, new_permissions)
      VALUES (NEW.page_id, NEW.user_id, COALESCE(auth.uid(), NEW.granted_by), 'permissions_changed', OLD.permissions, NEW.permissions);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.admin_access_audit (page_id, target_user_id, actor_user_id, action, old_permissions, new_permissions)
    VALUES (OLD.page_id, OLD.user_id, auth.uid(), 'revoke', OLD.permissions, NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_admin_page_access ON public.admin_page_access;
CREATE TRIGGER trg_log_admin_page_access
  AFTER INSERT OR DELETE ON public.admin_page_access
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_page_access_change();

DROP TRIGGER IF EXISTS trg_log_admin_page_access_upd ON public.admin_page_access;
CREATE TRIGGER trg_log_admin_page_access_upd
  BEFORE UPDATE ON public.admin_page_access
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_page_access_change();
