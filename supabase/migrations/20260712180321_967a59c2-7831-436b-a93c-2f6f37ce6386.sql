-- Optimistic-concurrency revision tracking for form_submissions
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Increment version on every content-bearing update
CREATE OR REPLACE FUNCTION public.bump_form_submission_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only bump when meaningful content changes (avoid loops on version-only writes)
  IF (NEW.data IS DISTINCT FROM OLD.data)
     OR (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.location IS DISTINCT FROM OLD.location)
     OR (NEW.within_geofence IS DISTINCT FROM OLD.within_geofence) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_form_submission_version ON public.form_submissions;
CREATE TRIGGER trg_bump_form_submission_version
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.bump_form_submission_version();

-- Guarded update: applies changes ONLY when the caller's expected version
-- matches the current server version. On mismatch it performs NO write and
-- returns the current server row so the client can surface a conflict dialog.
CREATE OR REPLACE FUNCTION public.update_submission_guarded(
  p_id uuid,
  p_expected_version integer,
  p_data jsonb,
  p_status text DEFAULT NULL,
  p_location jsonb DEFAULT NULL,
  p_within_geofence boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  form_id uuid,
  user_id uuid,
  data jsonb,
  location jsonb,
  within_geofence boolean,
  status text,
  version integer,
  updated_at timestamptz,
  conflict boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.form_submissions%ROWTYPE;
BEGIN
  SELECT * INTO v_current FROM public.form_submissions WHERE public.form_submissions.id = p_id;

  IF NOT FOUND THEN
    RETURN;  -- caller treats empty result as "insert new"
  END IF;

  -- Authorization: only the owner may update through this path.
  IF v_current.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized to update this submission';
  END IF;

  -- Version mismatch → conflict. Return current server row, write nothing.
  IF v_current.version IS DISTINCT FROM p_expected_version THEN
    RETURN QUERY SELECT
      v_current.id, v_current.form_id, v_current.user_id, v_current.data,
      v_current.location, v_current.within_geofence, v_current.status,
      v_current.version, v_current.updated_at, true;
    RETURN;
  END IF;

  UPDATE public.form_submissions AS fs SET
    data = p_data,
    status = COALESCE(p_status, fs.status),
    location = COALESCE(p_location, fs.location),
    within_geofence = COALESCE(p_within_geofence, fs.within_geofence)
  WHERE fs.id = p_id
  RETURNING
    fs.id, fs.form_id, fs.user_id, fs.data, fs.location, fs.within_geofence,
    fs.status, fs.version, fs.updated_at, false
  INTO id, form_id, user_id, data, location, within_geofence, status, version, updated_at, conflict;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_submission_guarded(uuid, integer, jsonb, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_guarded(uuid, integer, jsonb, text, jsonb, boolean) TO service_role;