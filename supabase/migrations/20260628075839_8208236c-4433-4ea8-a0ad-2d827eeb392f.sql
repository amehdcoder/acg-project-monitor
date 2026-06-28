-- Persistent client-side error diagnostics for authenticated dashboard users.
CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  component text NOT NULL,
  message text NOT NULL,
  stack text,
  component_stack text,
  route text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, SELECT ON public.client_error_logs TO authenticated;
GRANT ALL ON public.client_error_logs TO service_role;

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can log client errors" ON public.client_error_logs;
CREATE POLICY "Users can log client errors"
  ON public.client_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view their client errors" ON public.client_error_logs;
CREATE POLICY "Users can view their client errors"
  ON public.client_error_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_client_error_logs_created_at ON public.client_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_component ON public.client_error_logs (component, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_client_error(
  _component text,
  _message text,
  _stack text DEFAULT NULL,
  _component_stack text DEFAULT NULL,
  _route text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_error_logs (
    user_id, component, message, stack, component_stack, route, user_agent, metadata
  ) VALUES (
    auth.uid(),
    left(coalesce(nullif(_component, ''), 'Unknown component'), 200),
    left(coalesce(nullif(_message, ''), 'Unknown client error'), 2000),
    left(coalesce(_stack, ''), 20000),
    left(coalesce(_component_stack, ''), 20000),
    left(coalesce(_route, ''), 2000),
    left(coalesce(_user_agent, ''), 1000),
    coalesce(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text, jsonb) TO authenticated;

-- Owner RLS correction for live submissions and submission history.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'form_submissions'
      AND policyname = 'Owners can view all submissions'
  ) THEN
    CREATE POLICY "Owners can view all submissions"
      ON public.form_submissions
      FOR SELECT TO authenticated
      USING (public.is_owner_or_co_owner(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'form_submissions'
      AND policyname = 'Owners can clear submissions'
  ) THEN
    CREATE POLICY "Owners can clear submissions"
      ON public.form_submissions
      FOR DELETE TO authenticated
      USING (public.is_owner(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_versions'
      AND policyname = 'Owners can view submission versions'
  ) THEN
    CREATE POLICY "Owners can view submission versions"
      ON public.submission_versions
      FOR SELECT TO authenticated
      USING (public.is_owner_or_co_owner(auth.uid()));
  END IF;
END $$;

GRANT SELECT, DELETE ON public.form_submissions TO authenticated;
GRANT SELECT ON public.submission_versions TO authenticated;

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
  v_overlap int := 0;
  v_orphans int := 0;
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

  SELECT count(*) INTO v_overlap
  FROM public.form_submissions fs
  JOIN public.mda_archived_submissions a ON a.id = fs.id
  WHERE fs.form_id = _form_id OR a.form_id = _form_id;

  SELECT count(*) INTO v_orphans
  FROM public.submission_versions sv
  WHERE NOT EXISTS (
    SELECT 1 FROM public.form_submissions fs WHERE fs.id = sv.submission_id
  );

  RETURN jsonb_build_object(
    'live_count', v_live,
    'live_from', v_live_min,
    'live_to', v_live_max,
    'archived_count', v_arch,
    'archived_from', v_arch_min,
    'archived_to', v_arch_max,
    'live_archive_overlap', v_overlap,
    'submission_version_orphans', v_orphans,
    'consistent', (v_overlap = 0 AND v_orphans = 0)
  );
END;
$$;

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
  SELECT count(*) INTO v_orphans
  FROM public.submission_versions sv
  WHERE NOT EXISTS (SELECT 1 FROM public.form_submissions fs WHERE fs.id = sv.submission_id);

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
$$;

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
  v_expected int := 0;
  v_count int := 0;
  v_before_live int := 0;
  v_before_arch int := 0;
  v_after_live int := 0;
  v_after_arch int := 0;
  v_pre_overlap int := 0;
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

  SELECT count(*) INTO v_pre_overlap
  FROM public.mda_archived_submissions a
  JOIN public.form_submissions fs ON fs.id = a.id
  WHERE a.form_id = _form_id
    AND (_from IS NULL OR COALESCE(a.submitted_at, a.created_at) >= _from)
    AND (_to   IS NULL OR COALESCE(a.submitted_at, a.created_at) <= _to);

  IF v_pre_overlap <> 0 THEN
    RAISE EXCEPTION 'Restore blocked because % archived submissions already exist live. Clear the duplicate live records first.', v_pre_overlap
      USING ERRCODE = '23505';
  END IF;

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
  WHERE NOT EXISTS (SELECT 1 FROM public.form_submissions fs WHERE fs.id = sv.submission_id);

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
$$;

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
    'by', v_result->>'by',
    'consistency', v_result->'consistency'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_mda_data_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_clear_form_submissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_mda_data_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_clear_form_submissions(uuid) TO authenticated;