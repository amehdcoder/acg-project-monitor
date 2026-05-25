
-- 1. Iteration support for standard assessments
ALTER TABLE public.standard_assessment_submissions
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS activity_description text;

CREATE INDEX IF NOT EXISTS idx_sas_session_id
  ON public.standard_assessment_submissions(session_id);

-- 2. Soft-disable registry for standard forms
CREATE TABLE IF NOT EXISTS public.standard_form_disabled (
  form_code text PRIMARY KEY,
  disabled_at timestamptz NOT NULL DEFAULT now(),
  disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text
);

ALTER TABLE public.standard_form_disabled ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Any signed-in user can read disabled standard forms"
  ON public.standard_form_disabled;
CREATE POLICY "Any signed-in user can read disabled standard forms"
  ON public.standard_form_disabled
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can disable standard forms"
  ON public.standard_form_disabled;
CREATE POLICY "Admins can disable standard forms"
  ON public.standard_form_disabled
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins can re-enable standard forms"
  ON public.standard_form_disabled;
CREATE POLICY "Admins can re-enable standard forms"
  ON public.standard_form_disabled
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- 3. Update factory reset to soft-disable defaults instead of being silent about them
CREATE OR REPLACE FUNCTION public.owner_factory_reset(_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may perform a factory reset';
  END IF;
  IF _confirm IS DISTINCT FROM 'RESET TO FACTORY' THEN
    RAISE EXCEPTION 'Confirmation phrase mismatch';
  END IF;

  TRUNCATE TABLE
    public.ces_audit_log,
    public.ces_peer_validation_note_audits,
    public.ces_peer_validations,
    public.ces_segment_resamples,
    public.ces_feature_labels,
    public.ces_household_visits,
    public.ces_segments,
    public.ces_keyframes,
    public.ces_households,
    public.ces_capture_sessions,
    public.ces_surveys,
    public.ces_role_assignments,
    public.ces_fenced_communities,
    public.microplan_allocation_history,
    public.microplan_medicine_allocations,
    public.microplan_entries,
    public.microplan_designation_assignments,
    public.microplan_form_access,
    public.form_submissions,
    public.submission_versions,
    public.form_tracking_events,
    public.form_daily_targets,
    public.case_activities,
    public.cases,
    public.case_types,
    public.ntd_assessments,
    public.chat_messages,
    public.message_reactions,
    public.message_read_receipts,
    public.typing_indicators,
    public.chat_group_members,
    public.chat_groups,
    public.forum_replies,
    public.forum_likes,
    public.forum_posts,
    public.notifications,
    public.feedback,
    public.audit_logs,
    public.admin_surveillance_log,
    public.admin_tasks,
    public.app_usage_tracking,
    public.field_activity,
    public.sync_history,
    public.app_update_notifications,
    public.device_sessions,
    public.task_audit_trail,
    public.data_quality_issues,
    public.data_quality_indicators,
    public.dashboard_widgets,
    public.custom_dashboards,
    public.geofence_alert_access,
    public.user_geofence_assignments,
    public.user_form_assignments,
    public.user_project_assignments,
    public.vr_simulation_access,
    public.vr_simulations,
    public.voice_profiles,
    public.mesh_sync_relays,
    public.mesh_sync_transfers,
    public.quiz_attempts,
    public.quiz_user_assignments,
    public.quiz_questions,
    public.quizzes,
    public.active_calls,
    public.form_templates,
    public.forms,
    public.projects,
    public.standard_assessment_submissions
  RESTART IDENTITY CASCADE;

  -- Soft-disable default standard forms (kept visible but inactive)
  INSERT INTO public.standard_form_disabled (form_code, disabled_by, reason)
  VALUES
    ('wg_ss', v_user, 'factory_reset'),
    ('gad_7', v_user, 'factory_reset'),
    ('phq_9', v_user, 'factory_reset'),
    ('hfat',  v_user, 'factory_reset')
  ON CONFLICT (form_code) DO UPDATE SET
    disabled_at = now(),
    disabled_by = EXCLUDED.disabled_by,
    reason      = 'factory_reset';

  RETURN jsonb_build_object('reset', true, 'at', now(), 'by', v_user);
END;
$function$;
