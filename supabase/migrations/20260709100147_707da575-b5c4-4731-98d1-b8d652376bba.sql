-- =========================================================
-- 1. Profiles: block self-modification of privileged fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and owners may change anything.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For everyone else, sensitive fields must remain unchanged.
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active
     OR NEW.is_owner      IS DISTINCT FROM OLD.is_owner
     OR NEW.is_co_owner   IS DISTINCT FROM OLD.is_co_owner
     OR NEW.designation   IS DISTINCT FROM OLD.designation
  THEN
    RAISE EXCEPTION 'You are not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- =========================================================
-- 2. Mesh signaling: room-membership based read access
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_mesh_room_member(_room_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mesh_signaling
    WHERE room_id = _room_id
      AND created_by = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Peers read own signaling" ON public.mesh_signaling;
CREATE POLICY "Peers read signaling in their rooms"
ON public.mesh_signaling
FOR SELECT
USING (
  expires_at > now()
  AND (
    created_by = auth.uid()
    OR public.is_mesh_room_member(room_id)
  )
);