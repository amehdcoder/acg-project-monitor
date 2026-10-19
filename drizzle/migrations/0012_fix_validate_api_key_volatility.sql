CREATE OR REPLACE FUNCTION public.validate_api_key(_key_hash text)
RETURNS TABLE(key_id uuid, project_id uuid, scopes text[]) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.api_keys SET last_used_at = now()
  WHERE key_hash = _key_hash AND is_active AND revoked_at IS NULL
  RETURNING id, api_keys.project_id, api_keys.scopes;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_api_key(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(text) TO service_role;