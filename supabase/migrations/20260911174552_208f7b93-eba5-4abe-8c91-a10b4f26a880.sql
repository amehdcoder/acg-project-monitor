
REVOKE ALL ON FUNCTION public.facility_access_level(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facility_access_level(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_two_focal_persons() FROM PUBLIC, anon, authenticated;
