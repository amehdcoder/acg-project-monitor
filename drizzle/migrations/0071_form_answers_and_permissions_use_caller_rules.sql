ALTER FUNCTION public.visible_form_submissions(uuid, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.visible_form_submissions_for_forms(uuid[], integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.effective_programme_permissions(uuid, uuid) SECURITY INVOKER;