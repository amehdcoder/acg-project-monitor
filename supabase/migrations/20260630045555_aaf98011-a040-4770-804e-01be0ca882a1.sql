-- When a Super Admin / Owner / Co-owner assigns a signed-up user to a project,
-- treat that assignment as the vetting step: automatically approve the user's
-- profile so they immediately gain full access to what they're permitted to see.
CREATE OR REPLACE FUNCTION public.auto_approve_on_project_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT approval_status INTO v_status
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Only promote accounts that are not already approved and were not explicitly
  -- rejected by an admin. Rejected accounts must be re-reviewed manually.
  IF v_status IS DISTINCT FROM 'approved' AND v_status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.profiles
    SET approval_status = 'approved',
        updated_at = now()
    WHERE user_id = NEW.user_id;

    INSERT INTO public.notifications (user_id, title, message, type, category)
    VALUES (
      NEW.user_id,
      '✅ Access Granted',
      'You have been assigned to a project and approved. You now have full access to Amehnities.',
      'success',
      'registration'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_on_project_assignment ON public.user_project_assignments;
CREATE TRIGGER trg_auto_approve_on_project_assignment
AFTER INSERT ON public.user_project_assignments
FOR EACH ROW EXECUTE FUNCTION public.auto_approve_on_project_assignment();