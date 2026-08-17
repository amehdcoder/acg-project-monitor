
-- 1) Guard: only the platform owner may modify sensitive fields on other admin/owner-level accounts
CREATE OR REPLACE FUNCTION public.guard_admin_profile_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW; -- service role / server-side jobs
  END IF;

  IF public.is_platform_owner(v_actor) THEN
    RETURN NEW;
  END IF;

  -- target is another privileged account?
  IF NEW.user_id <> v_actor
     AND (public.is_admin(NEW.user_id) OR COALESCE(OLD.is_owner, false) OR COALESCE(OLD.is_co_owner, false)) THEN
    IF (NEW.designation IS DISTINCT FROM OLD.designation)
       OR (NEW.approval_status IS DISTINCT FROM OLD.approval_status)
       OR (COALESCE(NEW.is_active, true) IS DISTINCT FROM COALESCE(OLD.is_active, true))
       OR (COALESCE(NEW.is_owner, false) IS DISTINCT FROM COALESCE(OLD.is_owner, false))
       OR (COALESCE(NEW.is_co_owner, false) IS DISTINCT FROM COALESCE(OLD.is_co_owner, false)) THEN
      RAISE EXCEPTION 'Only the platform owner may change privileged settings of another administrator account';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_admin_profile_edits ON public.profiles;
CREATE TRIGGER trg_guard_admin_profile_edits
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_profile_edits();

-- 2) Audit trail for every privilege-relevant profile change (incl. co-owner grants)
CREATE OR REPLACE FUNCTION public.audit_profile_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF COALESCE(NEW.is_owner,false) IS DISTINCT FROM COALESCE(OLD.is_owner,false) THEN
    v_changes := v_changes || jsonb_build_object('is_owner', jsonb_build_object('from', OLD.is_owner, 'to', NEW.is_owner));
  END IF;
  IF COALESCE(NEW.is_co_owner,false) IS DISTINCT FROM COALESCE(OLD.is_co_owner,false) THEN
    v_changes := v_changes || jsonb_build_object('is_co_owner', jsonb_build_object('from', OLD.is_co_owner, 'to', NEW.is_co_owner));
  END IF;
  IF NEW.designation IS DISTINCT FROM OLD.designation THEN
    v_changes := v_changes || jsonb_build_object('designation', jsonb_build_object('from', OLD.designation, 'to', NEW.designation));
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    v_changes := v_changes || jsonb_build_object('approval_status', jsonb_build_object('from', OLD.approval_status, 'to', NEW.approval_status));
  END IF;
  IF COALESCE(NEW.is_active,true) IS DISTINCT FROM COALESCE(OLD.is_active,true) THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.account_audit_log (event_type, actor_id, target_user_id, target_email, success, details)
    VALUES ('profile_privilege_change', v_actor, NEW.user_id, NEW.email, true, v_changes);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_privilege_changes ON public.profiles;
CREATE TRIGGER trg_audit_profile_privilege_changes
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_privilege_changes();

-- 3) Reduce PII broadcast over realtime: stop shipping full old-row images for sensitive tables
ALTER TABLE public.irf_reports REPLICA IDENTITY DEFAULT;
ALTER TABLE public.acsm_reports REPLICA IDENTITY DEFAULT;
ALTER TABLE public.form_submissions REPLICA IDENTITY DEFAULT;
ALTER TABLE public.microplan_entries REPLICA IDENTITY DEFAULT;
ALTER TABLE public.seeclear_monitoring REPLICA IDENTITY DEFAULT;
ALTER TABLE public.bloomberg_validations REPLICA IDENTITY DEFAULT;
ALTER TABLE public.field_activity REPLICA IDENTITY DEFAULT;
ALTER TABLE public.locations REPLICA IDENTITY DEFAULT;
