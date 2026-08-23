DROP POLICY IF EXISTS "quiz_kobo_configs_analytics_read" ON public.quiz_kobo_configs;

CREATE OR REPLACE VIEW public.quiz_kobo_configs_safe
WITH (security_invoker = off) AS
SELECT id, quiz_id, server_url, form_uid, form_title, sync_mode,
       question_config, identity_fields, last_sync_at, last_event_at,
       created_by, created_at, updated_at
FROM public.quiz_kobo_configs c
WHERE public.is_admin(auth.uid())
   OR public.is_owner_level(auth.uid())
   OR public.has_quiz_analytics_access(c.quiz_id, auth.uid());

REVOKE ALL ON public.quiz_kobo_configs_safe FROM anon;
GRANT SELECT ON public.quiz_kobo_configs_safe TO authenticated;
GRANT ALL ON public.quiz_kobo_configs_safe TO service_role;