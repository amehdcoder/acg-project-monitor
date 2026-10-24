GRANT EXECUTE ON FUNCTION public.facility_access_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_record_at_facility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_at_facility(uuid, uuid) TO authenticated;