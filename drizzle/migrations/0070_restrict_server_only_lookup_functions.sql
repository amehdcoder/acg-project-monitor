REVOKE EXECUTE ON FUNCTION public.validate_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_ai_memory(extensions.vector, integer, double precision, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_ai_memory(extensions.vector, integer, double precision, text[], uuid) TO service_role;