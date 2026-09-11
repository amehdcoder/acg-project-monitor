-- ============ 1) Kobo integration credentials are server-side only ============
-- Non-secret "is it configured?" flags so the UI keeps working without ever
-- reading the credential itself.
ALTER TABLE public.quiz_kobo_configs
  ADD COLUMN IF NOT EXISTS has_api_token boolean GENERATED ALWAYS AS (api_token IS NOT NULL AND api_token <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_webhook_secret boolean GENERATED ALWAYS AS (webhook_secret IS NOT NULL AND webhook_secret <> '') STORED;

ALTER TABLE public.kobo_form_configs
  ADD COLUMN IF NOT EXISTS has_api_token boolean GENERATED ALWAYS AS (api_token IS NOT NULL AND api_token <> '') STORED;

ALTER TABLE public.checklist_dashboard_feeds
  ADD COLUMN IF NOT EXISTS has_api_token boolean GENERATED ALWAYS AS (api_token IS NOT NULL AND api_token <> '') STORED;

REVOKE SELECT ON public.quiz_kobo_configs FROM authenticated, anon;
GRANT SELECT (id, quiz_id, server_url, form_uid, form_title, sync_mode, question_config,
              identity_fields, last_sync_at, last_event_at, created_by, created_at, updated_at,
              has_api_token, has_webhook_secret)
  ON public.quiz_kobo_configs TO authenticated;

REVOKE SELECT ON public.kobo_form_configs FROM authenticated, anon;
GRANT SELECT (id, project_id, kobo_server_url, form_uid, form_title, field_mappings, form_status,
              last_inspected_at, last_deployed_at, created_by, created_at, updated_at,
              active_version_number, has_api_token)
  ON public.kobo_form_configs TO authenticated;

REVOKE SELECT ON public.checklist_dashboard_feeds FROM authenticated, anon;
GRANT SELECT (id, name, server_url, form_uid, is_active, created_by, created_at, updated_at, has_api_token)
  ON public.checklist_dashboard_feeds TO authenticated;

GRANT ALL ON public.quiz_kobo_configs TO service_role;
GRANT ALL ON public.kobo_form_configs TO service_role;
GRANT ALL ON public.checklist_dashboard_feeds TO service_role;

-- ============ 2) Microplan updates cannot widen their own scope ============
DROP POLICY IF EXISTS "Granted admins can update microplan entries" ON public.microplan_entries;
CREATE POLICY "Granted admins can update microplan entries"
ON public.microplan_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_page_access apa
    WHERE apa.user_id = (SELECT auth.uid()) AND apa.page_id = 'microplanning'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_page_access apa
    WHERE apa.user_id = (SELECT auth.uid()) AND apa.page_id = 'microplanning'
  )
);

DROP POLICY IF EXISTS "Field designations can update own microplan entries" ON public.microplan_entries;
CREATE POLICY "Field designations can update own microplan entries"
ON public.microplan_entries
FOR UPDATE
TO authenticated
USING (
  public.has_field_designation((SELECT auth.uid())) AND created_by = (SELECT auth.uid())
)
WITH CHECK (
  public.has_field_designation((SELECT auth.uid())) AND created_by = (SELECT auth.uid())
);

-- ============ 3) Device / network metadata is owner-tier only ============
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, user_id, email, first_name, last_name, phone_number, alternate_phone,
              alternate_email, designation, other_designation, state, lga, ward, is_active,
              is_owner, created_at, updated_at, notification_preferences, avatar_url,
              last_seen_at, last_device_type, approval_status, has_seen_tour, is_co_owner,
              location_tracking_enabled, current_version, has_quiz_access)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.profile_device_metadata(_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(user_id uuid, last_ip_address text, device_info jsonb, device_phone_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.last_ip_address, p.device_info, p.device_phone_number
  FROM public.profiles p
  WHERE (_user_ids IS NULL OR p.user_id = ANY(_user_ids))
    AND (
      p.user_id = (SELECT auth.uid())
      OR public.is_owner_or_co_owner((SELECT auth.uid()))
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.profile_device_metadata(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_device_metadata(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_device_metadata(uuid[]) TO service_role;