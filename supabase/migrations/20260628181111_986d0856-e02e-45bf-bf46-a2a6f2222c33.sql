
-- Owner-level helper (Owner OR Co-owner)
CREATE OR REPLACE FUNCTION public.is_owner_level(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND (is_owner = true OR is_co_owner = true)
  )
$$;

-- Archive store for owner-deleted dashboard records
CREATE TABLE IF NOT EXISTS public.owner_deleted_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table text NOT NULL,
  record_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  label text,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_deleted_records TO authenticated;
GRANT ALL ON public.owner_deleted_records TO service_role;

ALTER TABLE public.owner_deleted_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner level can view deleted records"
  ON public.owner_deleted_records FOR SELECT TO authenticated
  USING (public.is_owner_level(auth.uid()));

CREATE POLICY "Owner level can manage deleted records"
  ON public.owner_deleted_records FOR ALL TO authenticated
  USING (public.is_owner_level(auth.uid()))
  WITH CHECK (public.is_owner_level(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_owner_deleted_records_source
  ON public.owner_deleted_records (source_table, restored_at);

-- Whitelist guard for table names
CREATE OR REPLACE FUNCTION public.owner_delete_assert_allowed(_table text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _table NOT IN (
    'form_submissions','acsm_reports','irf_reports','sbc_reports',
    'seeclear_monitoring','ntd_assessments','ces_surveys','bloomberg_validations',
    'microplan_entries','office_form_submissions','standard_assessment_submissions',
    'uprp_submissions'
  ) THEN
    RAISE EXCEPTION 'Table % is not eligible for owner deletion', _table;
  END IF;
END;
$$;

-- Archive or permanently delete specific records by id
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
    RETURN jsonb_build_object('deleted', 0, 'archived', _archive);
  END IF;

  IF _archive THEN
    EXECUTE format(
      'INSERT INTO public.owner_deleted_records (source_table, record_id, snapshot, deleted_by)
       SELECT %L, t.id, to_jsonb(t), auth.uid() FROM public.%I t WHERE t.id = ANY($1)',
      _table, _table
    ) USING _ids;
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = ANY($1)', _table) USING _ids;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count, 'archived', _archive, 'table', _table);
END;
$$;

-- Archive or permanently delete by created_at date range (and optional filters)
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
       SELECT %L, t.id, to_jsonb(t), auth.uid() FROM public.%I t %s',
      _table, _table, v_where
    ) USING _from, _to, _filter_value;
  END IF;

  EXECUTE format(
    'DELETE FROM public.%I t %s', _table,
    replace(v_where, 't.', '')
  ) USING _from, _to, _filter_value;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count, 'archived', _archive, 'table', _table);
END;
$$;

-- Restore archived records back to their source table
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
