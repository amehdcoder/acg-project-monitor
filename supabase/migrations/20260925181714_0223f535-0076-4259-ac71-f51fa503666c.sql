DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (t.typname = 'trigger' OR p.proname = ANY (ARRAY[
        '_after_hours_insert_one','_after_hours_reviewers','audit_realtime_rls_coverage','increment_device_records',
        'invoke_mda_sync_job','jsonb_replace_local_reference_ids','owner_archive_mda_submissions','owner_mda_data_summary',
        'owner_permanent_delete_mda_submissions','owner_restore_mda_submissions','prune_mda_lens_access_events',
        'sync_mda_offline_rewritten_keys']))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;