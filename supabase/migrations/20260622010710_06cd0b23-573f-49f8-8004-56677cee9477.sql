REVOKE EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bloomberg_validation(jsonb) TO service_role;