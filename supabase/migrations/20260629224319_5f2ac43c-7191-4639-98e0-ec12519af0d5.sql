ALTER FUNCTION public._after_hours_allowed_tables() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.request_after_hours_submission(text, jsonb, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_after_hours_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_after_hours_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_review_after_hours(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public._after_hours_insert_one(text, jsonb) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public._after_hours_allowed_tables() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.request_after_hours_submission(text, jsonb, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_after_hours_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_after_hours_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_after_hours(uuid) TO authenticated;