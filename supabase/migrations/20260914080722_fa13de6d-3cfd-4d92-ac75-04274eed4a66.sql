REVOKE EXECUTE ON FUNCTION public.is_safeguarding_officer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_safeguarding_officer(uuid, uuid) TO authenticated, service_role;