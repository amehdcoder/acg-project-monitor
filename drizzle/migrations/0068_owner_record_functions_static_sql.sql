CREATE OR REPLACE FUNCTION public.owner_delete_records(_table text, _ids uuid[], _archive boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_count int := 0;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner or Co-owner can delete dashboard records'; END IF;
  PERFORM public.owner_delete_assert_allowed(_table);
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN jsonb_build_object('deleted', 0, 'archived', _archive, 'table', _table); END IF;
  IF _archive THEN
    IF _table = 'form_submissions' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.form_submissions x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'acsm_reports' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.acsm_reports x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'irf_reports' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.irf_reports x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'sbc_reports' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.sbc_reports x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'seeclear_monitoring' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.seeclear_monitoring x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'ntd_assessments' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.ntd_assessments x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'ces_surveys' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.ces_surveys x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'bloomberg_validations' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.bloomberg_validations x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'microplan_entries' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.microplan_entries x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'office_form_submissions' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.office_form_submissions x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'standard_assessment_submissions' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.standard_assessment_submissions x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'uprp_submissions' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.uprp_submissions x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    ELSIF _table = 'household_coverage_surveys' THEN INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by) SELECT _table, x.id, to_jsonb(x), auth.uid() FROM public.household_coverage_surveys x WHERE x.id = ANY(_ids) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  IF _table = 'form_submissions' THEN DELETE FROM public.form_submissions WHERE id = ANY(_ids);
  ELSIF _table = 'acsm_reports' THEN DELETE FROM public.acsm_reports WHERE id = ANY(_ids);
  ELSIF _table = 'irf_reports' THEN DELETE FROM public.irf_reports WHERE id = ANY(_ids);
  ELSIF _table = 'sbc_reports' THEN DELETE FROM public.sbc_reports WHERE id = ANY(_ids);
  ELSIF _table = 'seeclear_monitoring' THEN DELETE FROM public.seeclear_monitoring WHERE id = ANY(_ids);
  ELSIF _table = 'ntd_assessments' THEN DELETE FROM public.ntd_assessments WHERE id = ANY(_ids);
  ELSIF _table = 'ces_surveys' THEN DELETE FROM public.ces_surveys WHERE id = ANY(_ids);
  ELSIF _table = 'bloomberg_validations' THEN DELETE FROM public.bloomberg_validations WHERE id = ANY(_ids);
  ELSIF _table = 'microplan_entries' THEN DELETE FROM public.microplan_entries WHERE id = ANY(_ids);
  ELSIF _table = 'office_form_submissions' THEN DELETE FROM public.office_form_submissions WHERE id = ANY(_ids);
  ELSIF _table = 'standard_assessment_submissions' THEN DELETE FROM public.standard_assessment_submissions WHERE id = ANY(_ids);
  ELSIF _table = 'uprp_submissions' THEN DELETE FROM public.uprp_submissions WHERE id = ANY(_ids);
  ELSIF _table = 'household_coverage_surveys' THEN DELETE FROM public.household_coverage_surveys WHERE id = ANY(_ids);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count, 'archived', _archive, 'table', _table);
END; $f$;

CREATE OR REPLACE FUNCTION public.owner_bulk_delete_records(_table text, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _archive boolean DEFAULT true, _filter_column text DEFAULT NULL, _filter_value text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_ids uuid[];
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner or Co-owner can delete dashboard records'; END IF;
  PERFORM public.owner_delete_assert_allowed(_table);
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from > _to THEN RAISE EXCEPTION 'The start date must be before the end date'; END IF;
  IF _filter_column IS NOT NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = _table AND c.column_name = _filter_column) THEN
    RAISE EXCEPTION 'Invalid filter column';
  END IF;
  IF _table = 'form_submissions' THEN SELECT array_agg(x.id) INTO v_ids FROM public.form_submissions x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'acsm_reports' THEN SELECT array_agg(x.id) INTO v_ids FROM public.acsm_reports x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'irf_reports' THEN SELECT array_agg(x.id) INTO v_ids FROM public.irf_reports x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'sbc_reports' THEN SELECT array_agg(x.id) INTO v_ids FROM public.sbc_reports x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'seeclear_monitoring' THEN SELECT array_agg(x.id) INTO v_ids FROM public.seeclear_monitoring x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'ntd_assessments' THEN SELECT array_agg(x.id) INTO v_ids FROM public.ntd_assessments x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'ces_surveys' THEN SELECT array_agg(x.id) INTO v_ids FROM public.ces_surveys x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'bloomberg_validations' THEN SELECT array_agg(x.id) INTO v_ids FROM public.bloomberg_validations x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'microplan_entries' THEN SELECT array_agg(x.id) INTO v_ids FROM public.microplan_entries x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'office_form_submissions' THEN SELECT array_agg(x.id) INTO v_ids FROM public.office_form_submissions x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'standard_assessment_submissions' THEN SELECT array_agg(x.id) INTO v_ids FROM public.standard_assessment_submissions x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'uprp_submissions' THEN SELECT array_agg(x.id) INTO v_ids FROM public.uprp_submissions x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  ELSIF _table = 'household_coverage_surveys' THEN SELECT array_agg(x.id) INTO v_ids FROM public.household_coverage_surveys x WHERE (_from IS NULL OR x.created_at >= _from) AND (_to IS NULL OR x.created_at <= _to) AND (_filter_column IS NULL OR _filter_value IS NULL OR to_jsonb(x)->>_filter_column = _filter_value);
  END IF;
  RETURN public.owner_delete_records(_table, COALESCE(v_ids, '{}'::uuid[]), _archive);
END; $f$;

CREATE OR REPLACE FUNCTION public.owner_restore_records(_record_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r record; v_count int := 0; t text;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner or Co-owner can restore records'; END IF;
  IF _record_ids IS NULL OR array_length(_record_ids, 1) IS NULL THEN RETURN jsonb_build_object('restored', 0); END IF;
  FOR r IN SELECT * FROM public.owner_deleted_records WHERE id = ANY(_record_ids) AND restored_at IS NULL LOOP
    t := r.source_table;
    PERFORM public.owner_delete_assert_allowed(t);
    IF t = 'form_submissions' THEN INSERT INTO public.form_submissions SELECT * FROM jsonb_populate_record(NULL::public.form_submissions, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'acsm_reports' THEN INSERT INTO public.acsm_reports SELECT * FROM jsonb_populate_record(NULL::public.acsm_reports, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'irf_reports' THEN INSERT INTO public.irf_reports SELECT * FROM jsonb_populate_record(NULL::public.irf_reports, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'sbc_reports' THEN INSERT INTO public.sbc_reports SELECT * FROM jsonb_populate_record(NULL::public.sbc_reports, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'seeclear_monitoring' THEN INSERT INTO public.seeclear_monitoring SELECT * FROM jsonb_populate_record(NULL::public.seeclear_monitoring, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'ntd_assessments' THEN INSERT INTO public.ntd_assessments SELECT * FROM jsonb_populate_record(NULL::public.ntd_assessments, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'ces_surveys' THEN INSERT INTO public.ces_surveys SELECT * FROM jsonb_populate_record(NULL::public.ces_surveys, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'bloomberg_validations' THEN INSERT INTO public.bloomberg_validations SELECT * FROM jsonb_populate_record(NULL::public.bloomberg_validations, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'microplan_entries' THEN INSERT INTO public.microplan_entries SELECT * FROM jsonb_populate_record(NULL::public.microplan_entries, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'office_form_submissions' THEN INSERT INTO public.office_form_submissions SELECT * FROM jsonb_populate_record(NULL::public.office_form_submissions, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'standard_assessment_submissions' THEN INSERT INTO public.standard_assessment_submissions SELECT * FROM jsonb_populate_record(NULL::public.standard_assessment_submissions, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'uprp_submissions' THEN INSERT INTO public.uprp_submissions SELECT * FROM jsonb_populate_record(NULL::public.uprp_submissions, r.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSIF t = 'household_coverage_surveys' THEN INSERT INTO public.household_coverage_surveys SELECT * FROM jsonb_populate_record(NULL::public.household_coverage_surveys, r.snapshot) ON CONFLICT (id) DO NOTHING;
    END IF;
    UPDATE public.owner_deleted_records SET restored_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('restored', v_count);
END; $f$;

REVOKE EXECUTE ON FUNCTION public.owner_delete_records(text, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_restore_records(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_bulk_delete_records(text, timestamptz, timestamptz, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_delete_records(text, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_restore_records(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_bulk_delete_records(text, timestamptz, timestamptz, boolean, text, text) TO authenticated, service_role;