
REVOKE EXECUTE ON FUNCTION public.user_facility_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_facility_focal(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_facility_access_to_beneficiary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_facility_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_facility_focal(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_facility_access_to_beneficiary(uuid, uuid) TO authenticated, service_role;
