CREATE INDEX IF NOT EXISTS idx_ces_household_visits_survey_created
  ON public.ces_household_visits (survey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ces_household_visits_segment
  ON public.ces_household_visits (segment_id);
CREATE INDEX IF NOT EXISTS idx_ces_household_visits_device
  ON public.ces_household_visits (device_id);
CREATE INDEX IF NOT EXISTS idx_ces_household_visits_created_by
  ON public.ces_household_visits (created_by);

CREATE INDEX IF NOT EXISTS idx_ces_capture_sessions_project_created
  ON public.ces_capture_sessions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ces_households_session
  ON public.ces_households (session_id);
CREATE INDEX IF NOT EXISTS idx_ces_households_project
  ON public.ces_households (project_id);

CREATE INDEX IF NOT EXISTS idx_ces_surveys_project_created
  ON public.ces_surveys (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ces_surveys_status
  ON public.ces_surveys (status);

CREATE INDEX IF NOT EXISTS idx_ces_audit_log_survey_created
  ON public.ces_audit_log (survey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ces_segments_survey
  ON public.ces_segments (survey_id);

CREATE INDEX IF NOT EXISTS idx_ces_peer_validations_survey
  ON public.ces_peer_validations (survey_id);

CREATE INDEX IF NOT EXISTS idx_ces_keyframes_session
  ON public.ces_keyframes (session_id);

CREATE INDEX IF NOT EXISTS idx_ces_feature_labels_survey
  ON public.ces_feature_labels (survey_id);