REVOKE EXECUTE ON FUNCTION public.register_confirmed_mmdp_case(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_confirmed_mmdp_case(uuid, uuid) TO authenticated, service_role;