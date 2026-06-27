-- ── Phase 1: Owner data management for MDA Supervisory Checklist ──
-- Soft-delete archive so the Owner can clear test/sim data to go live and
-- restore some or all submissions for a defined period.

CREATE TABLE IF NOT EXISTS public.mda_archived_submissions (
  id uuid NOT NULL,
  form_id uuid NOT NULL,
  user_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  location jsonb,
  within_geofence boolean,
  status text NOT NULL DEFAULT 'sent',
  submitted_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submission_type text NOT NULL DEFAULT 'regular',
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_mda_archived_form_submitted
  ON public.mda_archived_submissions (form_id, submitted_at DESC);

GRANT SELECT ON public.mda_archived_submissions TO authenticated;
GRANT ALL ON public.mda_archived_submissions TO service_role;

ALTER TABLE public.mda_archived_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view archived submissions"
  ON public.mda_archived_submissions
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

-- ── Summary: live + archived counts and date bounds for a form ──
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

  SELECT count(*), min(COALESCE(submitted_at, created_at)), max(COALESCE(submitted_at, created_at))
    INTO v_live, v_live_min, v_live_max
  FROM public.form_submissions WHERE form_id = _form_id;

  SELECT count(*), min(COALESCE(submitted_at, created_at)), max(COALESCE(submitted_at, created_at))
    INTO v_arch, v_arch_min, v_arch_max
  FROM public.mda_archived_submissions WHERE form_id = _form_id;

  RETURN jsonb_build_object(
    'live_count', v_live, 'live_from', v_live_min, 'live_to', v_live_max,
    'archived_count', v_arch, 'archived_from', v_arch_min, 'archived_to', v_arch_max
  );
END;
$$;

-- ── Archive (soft-delete) submissions for a form within an optional range ──
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
  )
  INSERT INTO public.mda_archived_submissions (
    id, form_id, user_id, data, location, within_geofence, status,
    submitted_at, synced_at, created_at, updated_at, submission_type,
    archived_at, archived_by
  )
  SELECT id, form_id, user_id, data, location, within_geofence, status,
         submitted_at, synced_at, created_at, updated_at, submission_type,
         now(), v_user
  FROM moved
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('archived', v_count, 'form_id', _form_id, 'at', now(), 'by', v_user);
END;
$$;

-- ── Restore archived submissions for a form within an optional range ──
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
  )
  INSERT INTO public.form_submissions (
    id, form_id, user_id, data, location, within_geofence, status,
    submitted_at, synced_at, created_at, updated_at, submission_type
  )
  SELECT id, form_id, user_id, data, location, within_geofence, status,
         submitted_at, synced_at, created_at, updated_at, submission_type
  FROM moved
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('restored', v_count, 'form_id', _form_id, 'at', now(), 'by', v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_mda_data_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;