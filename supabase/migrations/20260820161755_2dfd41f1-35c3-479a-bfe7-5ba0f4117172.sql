REVOKE ALL ON FUNCTION public.is_within_proximity_radius(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_proximity_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_device_session_admin_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_proximity_radius(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_proximity_conversation(uuid, uuid) TO authenticated, service_role;