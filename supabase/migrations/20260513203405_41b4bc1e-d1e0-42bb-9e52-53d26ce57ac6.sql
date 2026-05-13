-- 1) Concurrency: version columns + auto-increment trigger
ALTER TABLE public.ces_surveys           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.ces_segments          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.ces_households        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.ces_capture_sessions  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.ces_household_visits  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_version_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ces_surveys_bump_version           ON public.ces_surveys;
DROP TRIGGER IF EXISTS ces_segments_bump_version          ON public.ces_segments;
DROP TRIGGER IF EXISTS ces_households_bump_version        ON public.ces_households;
DROP TRIGGER IF EXISTS ces_capture_sessions_bump_version  ON public.ces_capture_sessions;
DROP TRIGGER IF EXISTS ces_household_visits_bump_version  ON public.ces_household_visits;

CREATE TRIGGER ces_surveys_bump_version          BEFORE UPDATE ON public.ces_surveys          FOR EACH ROW EXECUTE FUNCTION public.bump_version_on_update();
CREATE TRIGGER ces_segments_bump_version         BEFORE UPDATE ON public.ces_segments         FOR EACH ROW EXECUTE FUNCTION public.bump_version_on_update();
CREATE TRIGGER ces_households_bump_version       BEFORE UPDATE ON public.ces_households       FOR EACH ROW EXECUTE FUNCTION public.bump_version_on_update();
CREATE TRIGGER ces_capture_sessions_bump_version BEFORE UPDATE ON public.ces_capture_sessions FOR EACH ROW EXECUTE FUNCTION public.bump_version_on_update();
CREATE TRIGGER ces_household_visits_bump_version BEFORE UPDATE ON public.ces_household_visits FOR EACH ROW EXECUTE FUNCTION public.bump_version_on_update();

-- 2) Owner: clear microplanning data (optionally filtered)
CREATE OR REPLACE FUNCTION public.owner_clear_microplanning(
  _project_id uuid DEFAULT NULL,
  _state text DEFAULT NULL,
  _lga text DEFAULT NULL,
  _year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_entries int := 0;
  v_alloc int := 0;
  v_history int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may clear microplanning data';
  END IF;

  DELETE FROM public.microplan_allocation_history
   WHERE (_project_id IS NULL OR project_id = _project_id)
     AND (_state IS NULL OR state = _state)
     AND (_lga IS NULL OR lga = _lga)
     AND (_year IS NULL OR year = _year);
  GET DIAGNOSTICS v_history = ROW_COUNT;

  DELETE FROM public.microplan_medicine_allocations
   WHERE (_project_id IS NULL OR project_id = _project_id)
     AND (_state IS NULL OR state = _state)
     AND (_lga IS NULL OR lga = _lga)
     AND (_year IS NULL OR year = _year);
  GET DIAGNOSTICS v_alloc = ROW_COUNT;

  DELETE FROM public.microplan_entries
   WHERE (_project_id IS NULL OR project_id = _project_id)
     AND (_state IS NULL OR state = _state)
     AND (_lga IS NULL OR lga = _lga)
     AND (_year IS NULL OR year_of_microplanning = _year);
  GET DIAGNOSTICS v_entries = ROW_COUNT;

  RETURN jsonb_build_object(
    'entries_deleted', v_entries,
    'allocations_deleted', v_alloc,
    'history_deleted', v_history,
    'at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_clear_microplanning(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_clear_microplanning(uuid, text, text, integer) TO authenticated;

-- 3) Owner: full factory reset of operational data
CREATE OR REPLACE FUNCTION public.owner_factory_reset(_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may perform a factory reset';
  END IF;
  IF _confirm IS DISTINCT FROM 'RESET TO FACTORY' THEN
    RAISE EXCEPTION 'Confirmation phrase mismatch';
  END IF;

  -- Empty all operational tables. We preserve: auth.users, profiles, user_roles,
  -- admin_page_access (so the Owner remains signed in & privileged afterwards).
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
    public.projects
  RESTART IDENTITY CASCADE;

  RETURN jsonb_build_object('reset', true, 'at', now(), 'by', v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_factory_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_factory_reset(text) TO authenticated;