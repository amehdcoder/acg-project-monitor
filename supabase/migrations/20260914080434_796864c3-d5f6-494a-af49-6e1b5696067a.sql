-- Restrict SELECT on secret-bearing columns: replace table-wide SELECT grants
-- with explicit column grants that exclude api_token / webhook_secret.

REVOKE SELECT ON public.quiz_kobo_configs FROM authenticated, anon;
GRANT SELECT (id, quiz_id, server_url, form_uid, form_title, sync_mode,
  question_config, identity_fields, last_sync_at, last_event_at, created_by,
  created_at, updated_at, has_api_token, has_webhook_secret)
  ON public.quiz_kobo_configs TO authenticated;
GRANT ALL ON public.quiz_kobo_configs TO service_role;

REVOKE SELECT ON public.kobo_form_configs FROM authenticated, anon;
GRANT SELECT (id, project_id, kobo_server_url, form_uid, form_title,
  field_mappings, form_status, last_inspected_at, last_deployed_at, created_by,
  created_at, updated_at, active_version_number, has_api_token)
  ON public.kobo_form_configs TO authenticated;
GRANT ALL ON public.kobo_form_configs TO service_role;

REVOKE SELECT ON public.checklist_dashboard_feeds FROM authenticated, anon;
GRANT SELECT (id, name, server_url, form_uid, is_active, created_by,
  created_at, updated_at, has_api_token)
  ON public.checklist_dashboard_feeds TO authenticated;
GRANT ALL ON public.checklist_dashboard_feeds TO service_role;