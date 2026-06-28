
-- 1. Fix archive: scope orphan-history check to truly orphaned versions
CREATE OR REPLACE FUNCTION public.owner_archive_mda_submissions(_form_id uuid, _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_expected int := 0;
  v_count int := 0;
  v_before_live int := 0;
  v_before_arch int := 0;
  v_after_live int := 0;
  v_after_arch int := 0;
  v_overlap int := 0;
  v_orphans int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may archive checklist submissions' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from > _to THEN
    RAISE EXCEPTION 'The start date must be before the end date' USING ERRCODE = '22007';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.form_submissions fs
  WHERE fs.form_id = _form_id
    AND (_from IS NULL OR COALESCE(fs.submitted_at, fs.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(fs.submitted_at, fs.created_at) <= _to);

  SELECT count(*) INTO v_before_live FROM public.form_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_before_arch FROM public.mda_archived_submissions WHERE form_id = _form_id;

  WITH moved AS (
    DELETE FROM public.form_submissions fs
    WHERE fs.form_id = _form_id
      AND (_from IS NULL OR COALESCE(fs.submitted_at, fs.created_at) >= _from)
      AND (_to   IS NULL OR COALESCE(fs.submitted_at, fs.created_at) <= _to)
    RETURNING fs.*
  ), archived AS (
    INSERT INTO public.mda_archived_submissions (
      id, form_id, user_id, data, location, within_geofence, status,
      submitted_at, synced_at, created_at, updated_at, submission_type,
      archived_at, archived_by
    )
    SELECT id, form_id, user_id, data, location, within_geofence, status,
           submitted_at, synced_at, created_at, updated_at, submission_type,
           now(), v_user
    FROM moved
    ON CONFLICT (id) DO UPDATE SET
      form_id = EXCLUDED.form_id,
      user_id = EXCLUDED.user_id,
      data = EXCLUDED.data,
      location = EXCLUDED.location,
      within_geofence = EXCLUDED.within_geofence,
      status = EXCLUDED.status,
      submitted_at = EXCLUDED.submitted_at,
      synced_at = EXCLUDED.synced_at,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      submission_type = EXCLUDED.submission_type,
      archived_at = EXCLUDED.archived_at,
      archived_by = EXCLUDED.archived_by
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM archived;

  SELECT count(*) INTO v_after_live FROM public.form_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_after_arch FROM public.mda_archived_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_overlap
  FROM public.form_submissions fs
  JOIN public.mda_archived_submissions a ON a.id = fs.id
  WHERE fs.form_id = _form_id OR a.form_id = _form_id;
  -- Truly orphaned history = referencing neither a live nor an archived submission.
  SELECT count(*) INTO v_orphans
  FROM public.submission_versions sv
  WHERE NOT EXISTS (SELECT 1 FROM public.form_submissions fs WHERE fs.id = sv.submission_id)
    AND NOT EXISTS (SELECT 1 FROM public.mda_archived_submissions a WHERE a.id = sv.submission_id);

  IF v_count <> v_expected OR v_overlap <> 0 OR v_orphans <> 0 THEN
    RAISE EXCEPTION 'Clear submissions consistency check failed: expected %, archived %, overlap %, orphan history %', v_expected, v_count, v_overlap, v_orphans
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'archived', v_count,
    'form_id', _form_id,
    'at', now(),
    'by', v_user,
    'consistency', jsonb_build_object(
      'ok', true,
      'action', 'archive',
      'expected_affected', v_expected,
      'affected', v_count,
      'before_live', v_before_live,
      'after_live', v_after_live,
      'before_archived', v_before_arch,
      'after_archived', v_after_arch,
      'live_archive_overlap', v_overlap,
      'submission_version_orphans', v_orphans
    )
  );
END;
$function$;

-- 2. Fix restore: same orphan-history scoping
CREATE OR REPLACE FUNCTION public.owner_restore_mda_submissions(_form_id uuid, _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_expected int := 0;
  v_count int := 0;
  v_before_live int := 0;
  v_before_arch int := 0;
  v_after_live int := 0;
  v_after_arch int := 0;
  v_overlap int := 0;
  v_orphans int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may restore checklist submissions' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from > _to THEN
    RAISE EXCEPTION 'The start date must be before the end date' USING ERRCODE = '22007';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.mda_archived_submissions a
  WHERE a.form_id = _form_id
    AND (_from IS NULL OR COALESCE(a.submitted_at, a.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(a.submitted_at, a.created_at) <= _to);

  SELECT count(*) INTO v_before_live FROM public.form_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_before_arch FROM public.mda_archived_submissions WHERE form_id = _form_id;

  WITH moved AS (
    DELETE FROM public.mda_archived_submissions a
    WHERE a.form_id = _form_id
      AND (_from IS NULL OR COALESCE(a.submitted_at, a.created_at) >= _from)
      AND (_to   IS NULL OR COALESCE(a.submitted_at, a.created_at) <= _to)
    RETURNING a.*
  ), restored AS (
    INSERT INTO public.form_submissions (
      id, form_id, user_id, data, location, within_geofence, status,
      submitted_at, synced_at, created_at, updated_at, submission_type
    )
    SELECT id, form_id, user_id, data, location, within_geofence, status,
           submitted_at, synced_at, created_at, updated_at, submission_type
    FROM moved
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM restored;

  SELECT count(*) INTO v_after_live FROM public.form_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_after_arch FROM public.mda_archived_submissions WHERE form_id = _form_id;
  SELECT count(*) INTO v_overlap
  FROM public.form_submissions fs
  JOIN public.mda_archived_submissions a ON a.id = fs.id
  WHERE fs.form_id = _form_id OR a.form_id = _form_id;
  SELECT count(*) INTO v_orphans
  FROM public.submission_versions sv
  WHERE NOT EXISTS (SELECT 1 FROM public.form_submissions fs WHERE fs.id = sv.submission_id)
    AND NOT EXISTS (SELECT 1 FROM public.mda_archived_submissions a WHERE a.id = sv.submission_id);

  IF v_count <> v_expected OR v_overlap <> 0 OR v_orphans <> 0 THEN
    RAISE EXCEPTION 'Restore consistency check failed: expected %, restored %, overlap %, orphan history %', v_expected, v_count, v_overlap, v_orphans
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'restored', v_count,
    'form_id', _form_id,
    'at', now(),
    'by', v_user,
    'consistency', jsonb_build_object(
      'ok', true,
      'action', 'restore',
      'expected_affected', v_expected,
      'affected', v_count,
      'before_live', v_before_live,
      'after_live', v_after_live,
      'before_archived', v_before_arch,
      'after_archived', v_after_arch,
      'live_archive_overlap', v_overlap,
      'submission_version_orphans', v_orphans
    )
  );
END;
$function$;

-- 3. New: permanent delete (Owner only) across live + archive, with date range
CREATE OR REPLACE FUNCTION public.owner_permanent_delete_mda_submissions(_form_id uuid, _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_expected_live int := 0;
  v_expected_arch int := 0;
  v_deleted_live int := 0;
  v_deleted_arch int := 0;
  v_deleted_versions int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may permanently delete checklist submissions' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from > _to THEN
    RAISE EXCEPTION 'The start date must be before the end date' USING ERRCODE = '22007';
  END IF;

  SELECT count(*) INTO v_expected_live
  FROM public.form_submissions fs
  WHERE fs.form_id = _form_id
    AND (_from IS NULL OR COALESCE(fs.submitted_at, fs.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(fs.submitted_at, fs.created_at) <= _to);

  SELECT count(*) INTO v_expected_arch
  FROM public.mda_archived_submissions a
  WHERE a.form_id = _form_id
    AND (_from IS NULL OR COALESCE(a.submitted_at, a.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(a.submitted_at, a.created_at) <= _to);

  -- Collect the target submission ids from both stores.
  CREATE TEMP TABLE _doomed_ids ON COMMIT DROP AS
  SELECT fs.id FROM public.form_submissions fs
  WHERE fs.form_id = _form_id
    AND (_from IS NULL OR COALESCE(fs.submitted_at, fs.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(fs.submitted_at, fs.created_at) <= _to)
  UNION
  SELECT a.id FROM public.mda_archived_submissions a
  WHERE a.form_id = _form_id
    AND (_from IS NULL OR COALESCE(a.submitted_at, a.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(a.submitted_at, a.created_at) <= _to);

  -- Remove edit history for those submissions first.
  WITH d AS (
    DELETE FROM public.submission_versions sv
    WHERE sv.submission_id IN (SELECT id FROM _doomed_ids)
    RETURNING 1
  ) SELECT count(*) INTO v_deleted_versions FROM d;

  WITH d AS (
    DELETE FROM public.form_submissions fs
    WHERE fs.id IN (SELECT id FROM _doomed_ids) AND fs.form_id = _form_id
    RETURNING 1
  ) SELECT count(*) INTO v_deleted_live FROM d;

  WITH d AS (
    DELETE FROM public.mda_archived_submissions a
    WHERE a.id IN (SELECT id FROM _doomed_ids) AND a.form_id = _form_id
    RETURNING 1
  ) SELECT count(*) INTO v_deleted_arch FROM d;

  RETURN jsonb_build_object(
    'deleted', v_deleted_live + v_deleted_arch,
    'deleted_live', v_deleted_live,
    'deleted_archived', v_deleted_arch,
    'deleted_versions', v_deleted_versions,
    'form_id', _form_id,
    'at', now(),
    'by', v_user,
    'consistency', jsonb_build_object(
      'ok', (v_deleted_live = v_expected_live AND v_deleted_arch = v_expected_arch),
      'action', 'permanent_delete',
      'expected_affected', v_expected_live + v_expected_arch,
      'affected', v_deleted_live + v_deleted_arch
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.owner_permanent_delete_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
