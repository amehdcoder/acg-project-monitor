-- ============================================================================
-- PHASE 1: Indexes on foreign keys / user_id / project_id / hot filter cols
-- ============================================================================

-- form_submissions
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id           ON public.form_submissions (form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id           ON public.form_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at_desc ON public.form_submissions (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status            ON public.form_submissions (status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_uuid   ON public.form_submissions (submission_uuid);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_submitted    ON public.form_submissions (form_id, submitted_at DESC);

-- forms
CREATE INDEX IF NOT EXISTS idx_forms_project_id  ON public.forms (project_id);
CREATE INDEX IF NOT EXISTS idx_forms_created_by  ON public.forms (created_by);
CREATE INDEX IF NOT EXISTS idx_forms_status      ON public.forms (status);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id       ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_designation   ON public.profiles (designation);
CREATE INDEX IF NOT EXISTS idx_profiles_approval      ON public.profiles (approval_status);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON public.projects (status);

-- user_project_assignments
CREATE INDEX IF NOT EXISTS idx_upa_user_id    ON public.user_project_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_upa_project_id ON public.user_project_assignments (project_id);
CREATE INDEX IF NOT EXISTS idx_upa_user_proj  ON public.user_project_assignments (user_id, project_id);

-- microplan_entries
CREATE INDEX IF NOT EXISTS idx_mpe_project_id      ON public.microplan_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_mpe_created_by      ON public.microplan_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_mpe_state_lga_ward  ON public.microplan_entries (state, lga, ward);
CREATE INDEX IF NOT EXISTS idx_mpe_updated_at_desc ON public.microplan_entries (updated_at DESC);

-- reference_locations
CREATE INDEX IF NOT EXISTS idx_ref_locations_project_id ON public.reference_locations (project_id);
CREATE INDEX IF NOT EXISTS idx_ref_locations_entity     ON public.reference_locations (entity_type);
CREATE INDEX IF NOT EXISTS idx_ref_locations_slw        ON public.reference_locations (state, lga, ward);
CREATE INDEX IF NOT EXISTS idx_ref_locations_parent     ON public.reference_locations (parent_id);

-- attendance_records
CREATE INDEX IF NOT EXISTS idx_att_records_session_id     ON public.attendance_records (session_id);
CREATE INDEX IF NOT EXISTS idx_att_records_participant_id ON public.attendance_records (participant_id);
CREATE INDEX IF NOT EXISTS idx_att_records_marked_at      ON public.attendance_records (marked_at DESC);

-- bmz_monitoring
CREATE INDEX IF NOT EXISTS idx_bmz_monitor_id     ON public.bmz_monitoring (monitor_id);
CREATE INDEX IF NOT EXISTS idx_bmz_date_of_visit  ON public.bmz_monitoring (date_of_visit DESC);
CREATE INDEX IF NOT EXISTS idx_bmz_lga            ON public.bmz_monitoring (lga);
CREATE INDEX IF NOT EXISTS idx_bmz_submission_uuid ON public.bmz_monitoring (submission_uuid);

-- acsm_reports
CREATE INDEX IF NOT EXISTS idx_acsm_project_id   ON public.acsm_reports (project_id);
CREATE INDEX IF NOT EXISTS idx_acsm_created_by   ON public.acsm_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_acsm_date_reported ON public.acsm_reports (date_reported DESC);
CREATE INDEX IF NOT EXISTS idx_acsm_slw          ON public.acsm_reports (state, lga, ward);

-- sbc_reports
CREATE INDEX IF NOT EXISTS idx_sbc_project_id   ON public.sbc_reports (project_id);
CREATE INDEX IF NOT EXISTS idx_sbc_created_by   ON public.sbc_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_sbc_date_reported ON public.sbc_reports (date_reported DESC);
CREATE INDEX IF NOT EXISTS idx_sbc_slw          ON public.sbc_reports (state, lga, ward);

-- ces_household_visits
CREATE INDEX IF NOT EXISTS idx_ces_hh_survey_id  ON public.ces_household_visits (survey_id);
CREATE INDEX IF NOT EXISTS idx_ces_hh_segment_id ON public.ces_household_visits (segment_id);
CREATE INDEX IF NOT EXISTS idx_ces_hh_created_by ON public.ces_household_visits (created_by);
CREATE INDEX IF NOT EXISTS idx_ces_hh_visited_at ON public.ces_household_visits (visited_at DESC);

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_created ON public.chat_messages (chat_group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id     ON public.chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to      ON public.chat_messages (reply_to_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications (user_id) WHERE read = false;

-- case_activities
CREATE INDEX IF NOT EXISTS idx_case_act_case_id      ON public.case_activities (case_id);
CREATE INDEX IF NOT EXISTS idx_case_act_performed_by ON public.case_activities (performed_by);
CREATE INDEX IF NOT EXISTS idx_case_act_performed_at ON public.case_activities (performed_at DESC);

-- submission_versions
CREATE INDEX IF NOT EXISTS idx_sv_submission_id ON public.submission_versions (submission_id);
CREATE INDEX IF NOT EXISTS idx_sv_changed_by    ON public.submission_versions (changed_by);
CREATE INDEX IF NOT EXISTS idx_sv_changed_at    ON public.submission_versions (changed_at DESC);


-- ============================================================================
-- PHASE 1: Pre-joined enriched VIEWS with security_invoker so base-table RLS
-- policies still filter every row (auth.uid() is preserved).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_form_submissions_enriched
WITH (security_invoker = on) AS
SELECT
  fs.id,
  fs.form_id,
  fs.user_id,
  fs.data,
  fs.location,
  fs.within_geofence,
  fs.status,
  fs.submitted_at,
  fs.synced_at,
  fs.created_at,
  fs.updated_at,
  fs.submission_type,
  fs.submission_uuid,
  fs.client_submitted_at,
  fs.version,
  f.name        AS form_name,
  f.project_id  AS form_project_id,
  f.status      AS form_status,
  p.first_name  AS submitter_first_name,
  p.last_name   AS submitter_last_name,
  p.email       AS submitter_email,
  p.designation AS submitter_designation
FROM public.form_submissions fs
LEFT JOIN public.forms    f ON f.id = fs.form_id
LEFT JOIN public.profiles p ON p.user_id = fs.user_id;

GRANT SELECT ON public.v_form_submissions_enriched TO authenticated;
GRANT ALL    ON public.v_form_submissions_enriched TO service_role;


CREATE OR REPLACE VIEW public.v_user_project_assignments_enriched
WITH (security_invoker = on) AS
SELECT
  upa.id,
  upa.user_id,
  upa.project_id,
  upa.assigned_by,
  upa.starts_at,
  upa.expires_at,
  upa.created_at,
  upa.updated_at,
  pr.name         AS project_name,
  pr.status       AS project_status,
  pr.start_date   AS project_start_date,
  pr.end_date     AS project_end_date,
  pf.first_name   AS user_first_name,
  pf.last_name    AS user_last_name,
  pf.email        AS user_email,
  pf.designation  AS user_designation,
  pf.approval_status AS user_approval_status
FROM public.user_project_assignments upa
LEFT JOIN public.projects pr ON pr.id = upa.project_id
LEFT JOIN public.profiles pf ON pf.user_id = upa.user_id;

GRANT SELECT ON public.v_user_project_assignments_enriched TO authenticated;
GRANT ALL    ON public.v_user_project_assignments_enriched TO service_role;


CREATE OR REPLACE VIEW public.v_microplan_entries_enriched
WITH (security_invoker = on) AS
SELECT
  mpe.*,
  rl.id         AS reference_location_id,
  rl.entity_type AS reference_entity_type,
  rl.name       AS reference_name,
  rl.latitude   AS reference_latitude,
  rl.longitude  AS reference_longitude
FROM public.microplan_entries mpe
LEFT JOIN public.reference_locations rl
  ON rl.project_id = mpe.project_id
 AND rl.entity_type = 'community'
 AND rl.state = mpe.state
 AND rl.lga   = mpe.lga
 AND rl.ward  = mpe.ward
 AND rl.name  = mpe.community_name;

GRANT SELECT ON public.v_microplan_entries_enriched TO authenticated;
GRANT ALL    ON public.v_microplan_entries_enriched TO service_role;
