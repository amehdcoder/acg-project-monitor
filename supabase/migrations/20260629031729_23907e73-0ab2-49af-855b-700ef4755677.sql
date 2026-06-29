CREATE OR REPLACE FUNCTION public.owner_bulk_delete_records(
  _table text,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _archive boolean DEFAULT true,
  _filter_column text DEFAULT NULL,
  _filter_value text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  v_where text;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner or Co-owner can delete dashboard records';
  END IF;
  PERFORM public.owner_delete_assert_allowed(_table);

  IF _from IS NOT NULL AND _to IS NOT NULL AND _from > _to THEN
    RAISE EXCEPTION 'The start date must be before the end date';
  END IF;

  IF _filter_column IS NOT NULL AND _filter_column !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid filter column';
  END IF;

  v_where := 'WHERE ($1 IS NULL OR t.created_at >= $1) AND ($2 IS NULL OR t.created_at <= $2)';
  IF _filter_column IS NOT NULL AND _filter_value IS NOT NULL THEN
    v_where := v_where || format(' AND t.%I::text = $3', _filter_column);
  END IF;

  IF _archive THEN
    EXECUTE format(
      'INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by)
       SELECT %L, t.id, to_jsonb(t), auth.uid() FROM public.%I t %s
       ON CONFLICT DO NOTHING',
      _table, _table, v_where
    ) USING _from, _to, _filter_value;
  END IF;

  EXECUTE format('DELETE FROM public.%I t %s', _table, v_where)
    USING _from, _to, _filter_value;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count, 'archived', _archive, 'table', _table);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_delete_records(
  _table text,
  _ids uuid[],
  _archive boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner or Co-owner can delete dashboard records';
  END IF;
  PERFORM public.owner_delete_assert_allowed(_table);

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'archived', _archive, 'table', _table);
  END IF;

  IF _archive THEN
    EXECUTE format(
      'INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by)
       SELECT %L, t.id, to_jsonb(t), auth.uid() FROM public.%I t WHERE t.id = ANY($1)
       ON CONFLICT DO NOTHING',
      _table, _table
    ) USING _ids;
  END IF;

  EXECUTE format('DELETE FROM public.%I t WHERE t.id = ANY($1)', _table) USING _ids;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count, 'archived', _archive, 'table', _table);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_restore_records(_record_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner or Co-owner can restore records';
  END IF;

  IF _record_ids IS NULL OR array_length(_record_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('restored', 0);
  END IF;

  FOR r IN
    SELECT * FROM public.owner_deleted_records
    WHERE id = ANY(_record_ids) AND restored_at IS NULL
  LOOP
    PERFORM public.owner_delete_assert_allowed(r.source_table);
    EXECUTE format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO NOTHING',
      r.source_table, r.source_table
    ) USING r.snapshot;
    UPDATE public.owner_deleted_records SET restored_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('restored', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_delete_records(text, uuid[], boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owner_bulk_delete_records(text, timestamptz, timestamptz, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owner_restore_records(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_delete_records(text, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_bulk_delete_records(text, timestamptz, timestamptz, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_records(uuid[]) TO authenticated;