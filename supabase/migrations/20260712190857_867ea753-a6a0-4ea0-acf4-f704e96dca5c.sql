REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_microplan_form_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_form_submissions(uuid, uuid) FROM PUBLIC, anon;