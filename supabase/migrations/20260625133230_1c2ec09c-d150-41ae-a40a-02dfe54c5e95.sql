REVOKE ALL ON FUNCTION public.current_user_can_build_mda_followups() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_build_mda_followups() FROM anon;
REVOKE ALL ON FUNCTION public.current_user_can_build_mda_followups() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_followup_builder_admin_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_followup_builder_admin_guard() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_followup_builder_admin_guard() FROM authenticated;