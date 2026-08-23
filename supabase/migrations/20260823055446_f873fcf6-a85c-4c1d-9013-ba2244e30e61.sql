
DROP POLICY IF EXISTS "Only admins can update user roles" ON public.user_roles;
CREATE POLICY "Only super admins can update user roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Only admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete non-privileged user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (has_role(auth.uid(), 'systems_admin'::app_role) AND role = 'user'::app_role)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id AND p.is_owner = true
  )
);

CREATE OR REPLACE FUNCTION public.guard_privileged_role_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('super_admin'::app_role, 'systems_admin'::app_role) THEN
    IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Only super admins can grant privileged roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_privileged_role_grants_trg ON public.user_roles;
CREATE TRIGGER guard_privileged_role_grants_trg
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_role_grants();
