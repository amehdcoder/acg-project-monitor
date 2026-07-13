CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins/owners may change any field (they update via their own privileges).
  IF public.is_admin(auth.uid()) OR public.is_owner(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For a normal user updating their own row, block changes to sensitive,
  -- privilege-bearing fields by resetting them to their previous values.
  IF NEW.designation IS DISTINCT FROM OLD.designation THEN
    NEW.designation := OLD.designation;
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    NEW.approval_status := OLD.approval_status;
  END IF;
  IF NEW.is_co_owner IS DISTINCT FROM OLD.is_co_owner THEN
    NEW.is_co_owner := OLD.is_co_owner;
  END IF;
  IF NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
    NEW.is_owner := OLD.is_owner;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();