REVOKE EXECUTE ON FUNCTION public.is_email_deleted(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_inactive_login_attempt(text, text, text, uuid, text, jsonb, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_email_deleted(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_inactive_login_attempt(text, text, text, uuid, text, jsonb, timestamptz) TO service_role;