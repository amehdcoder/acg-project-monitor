REVOKE EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_beneficiary_case_id(uuid, uuid) TO service_role;