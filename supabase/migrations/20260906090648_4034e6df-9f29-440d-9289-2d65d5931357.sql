REVOKE EXECUTE ON FUNCTION public.has_standard_form(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_standard_form(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_standard_form(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_standard_form(uuid, text) TO service_role;