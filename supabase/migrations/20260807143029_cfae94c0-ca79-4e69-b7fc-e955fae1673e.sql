REVOKE EXECUTE ON FUNCTION public.has_active_mda_lens(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mda_lens_allows_project(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mda_lens_allows_row(uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_mda_lens(uuid) TO sandbox_exec_vhuixgcjmrmfowzrulac;
GRANT EXECUTE ON FUNCTION public.mda_lens_allows_project(uuid, uuid) TO sandbox_exec_vhuixgcjmrmfowzrulac;
GRANT EXECUTE ON FUNCTION public.mda_lens_allows_row(uuid, uuid, text, text, text, text) TO sandbox_exec_vhuixgcjmrmfowzrulac;