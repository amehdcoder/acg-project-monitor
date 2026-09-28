DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname = ANY (ARRAY['current_user_can_build_mda_followups','can_access_irf_category','can_read_microplan_entry','can_edit_dashboard','is_owner_email','is_standard_forms_restricted','user_has_microplan_scope','user_has_microplan_project_access','has_ces_role','can_bulk_data','can_view_form_submissions','is_sarmaan_form_grantee','has_form_assignment','is_mesh_room_member','user_facility_ids','is_facility_focal','has_quiz_page_access','facility_access_level','is_case_team_member','can_survey_households','has_minimal_access'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;