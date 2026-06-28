-- Harden Owner MDA data clearing/restoring so dashboard clearing is reliable and non-destructive.

-- Owner-only summary for live + archived MDA submissions.
CREATE OR REPLACE FUNCTION public.owner_mda_data_summary(_form_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_live int := 0;
  v_arch int := 0;
  v_live_min timestamptz;
  v_live_max timestamptz;
  v_arch_min timestamptz;
  v_arch_max timestamptz;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may view data management summary' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), min(COALESCE(submitted_at, created_at)), max(COALESCE(submitted_at, created_at))
    INTO v_live, v_live_min, v_live_max
  FROM public.form_submissions
  WHERE form_id = _form_id;

  SELECT count(*), min(COALESCE(submitted_at, created_at)), max(COALESCE(submitted_at, created_at))
    INTO v_arch, v_arch_min, v_arch_max
  FROM public.mda_archived_submissions
  WHERE form_id = _form_id;

  RETURN jsonb_build_object(
    'live_count', v_live,
    'live_from', v_live_min,
    'live_to', v_live_max,
    'archived_count', v_arch,
    'archived_from', v_arch_min,
    'archived_to', v_arch_max
  );
END;
$$;

-- Archive live submissions with an UPSERT, then count archived rows from the successful archive write.
-- This prevents false "0 archived" results and prevents data loss on repeated clears.
CREATE OR REPLACE FUNCTION public.owner_archive_mda_submissions(
  _form_id uuid,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may archive checklist submissions' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;

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

  RETURN jsonb_build_object('archived', v_count, 'form_id', _form_id, 'at', now(), 'by', v_user);
END;
$$;

-- Restore archived submissions with an UPSERT and count successful live writes.
CREATE OR REPLACE FUNCTION public.owner_restore_mda_submissions(
  _form_id uuid,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may restore checklist submissions' USING ERRCODE = '42501';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required' USING ERRCODE = '22023';
  END IF;

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
      submission_type = EXCLUDED.submission_type
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM restored;

  RETURN jsonb_build_object('restored', v_count, 'form_id', _form_id, 'at', now(), 'by', v_user);
END;
$$;

-- Keep older Owner clear entry-point safe: it now archives rather than permanently destroys rows.
CREATE OR REPLACE FUNCTION public.owner_clear_form_submissions(_form_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.owner_archive_mda_submissions(_form_id, NULL, NULL);
  RETURN jsonb_build_object(
    'cleared', true,
    'archived', COALESCE((v_result->>'archived')::int, 0),
    'form_id', _form_id,
    'at', v_result->>'at',
    'by', v_result->>'by'
  );
END;
$$;

-- Complete Owner-only archive policies for direct and future RPC-backed operations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mda_archived_submissions'
      AND policyname = 'Owner can insert archived submissions'
  ) THEN
    CREATE POLICY "Owner can insert archived submissions"
      ON public.mda_archived_submissions
      FOR INSERT TO authenticated
      WITH CHECK (public.is_owner(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mda_archived_submissions'
      AND policyname = 'Owner can update archived submissions'
  ) THEN
    CREATE POLICY "Owner can update archived submissions"
      ON public.mda_archived_submissions
      FOR UPDATE TO authenticated
      USING (public.is_owner(auth.uid()))
      WITH CHECK (public.is_owner(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mda_archived_submissions'
      AND policyname = 'Owner can delete archived submissions'
  ) THEN
    CREATE POLICY "Owner can delete archived submissions"
      ON public.mda_archived_submissions
      FOR DELETE TO authenticated
      USING (public.is_owner(auth.uid()));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_mda_data_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_clear_form_submissions(uuid) TO authenticated;