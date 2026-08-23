DROP VIEW IF EXISTS public.quiz_kobo_configs_safe;

CREATE OR REPLACE FUNCTION public.get_quiz_kobo_config_safe(_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  server_url text,
  form_uid text,
  form_title text,
  sync_mode text,
  question_config jsonb,
  identity_fields jsonb,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.quiz_id, c.server_url, c.form_uid, c.form_title, c.sync_mode,
         c.question_config, c.identity_fields, c.last_sync_at, c.last_event_at,
         c.created_by, c.created_at, c.updated_at
  FROM public.quiz_kobo_configs c
  WHERE c.quiz_id = _quiz_id
    AND (
      public.is_admin(auth.uid())
      OR public.is_owner_level(auth.uid())
      OR public.has_quiz_analytics_access(c.quiz_id, auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_quiz_kobo_config_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_kobo_config_safe(uuid) TO authenticated;