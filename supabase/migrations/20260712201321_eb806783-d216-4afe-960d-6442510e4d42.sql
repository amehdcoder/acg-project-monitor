CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.mda_sync_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  forms_scanned integer NOT NULL DEFAULT 0,
  submissions_scanned integer NOT NULL DEFAULT 0,
  submissions_rewritten integer NOT NULL DEFAULT 0,
  references_scanned integer NOT NULL DEFAULT 0,
  references_promoted integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

GRANT SELECT ON public.mda_sync_job_runs TO authenticated;
GRANT ALL ON public.mda_sync_job_runs TO service_role;

ALTER TABLE public.mda_sync_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view MDA sync job runs" ON public.mda_sync_job_runs;
CREATE POLICY "Admins can view MDA sync job runs"
ON public.mda_sync_job_runs
FOR SELECT
TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR public.is_owner_or_co_owner((SELECT auth.uid())));

DROP POLICY IF EXISTS "Service role manages MDA sync job runs" ON public.mda_sync_job_runs;
CREATE POLICY "Service role manages MDA sync job runs"
ON public.mda_sync_job_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mda_sync_job_runs_started_at
ON public.mda_sync_job_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_created_by
ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status_name
ON public.projects (status, name);
CREATE INDEX IF NOT EXISTS idx_forms_project_created
ON public.forms (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_project_name
ON public.forms (project_id, name);
CREATE INDEX IF NOT EXISTS idx_forms_mda_settings_expr
ON public.forms ((COALESCE(settings ->> 'isMdaChecklist', 'false')))
WHERE COALESCE(settings ->> 'isMdaChecklist', 'false') IN ('true', '1');
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_user_project
ON public.user_project_assignments (user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_project_user
ON public.user_project_assignments (project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_form_assignments_user_form
ON public.user_form_assignments (user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_user_form_assignments_form_user
ON public.user_form_assignments (form_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sarmaan_form_access_user_form
ON public.sarmaan_form_access (user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_sarmaan_form_access_form_user
ON public.sarmaan_form_access (form_id, user_id);
CREATE INDEX IF NOT EXISTS idx_microplan_form_access_user
ON public.microplan_form_access (user_id);
CREATE INDEX IF NOT EXISTS idx_reference_locations_project_name
ON public.reference_locations (project_id, name);
CREATE INDEX IF NOT EXISTS idx_reference_locations_created_local
ON public.reference_locations (created_by, local_ref)
WHERE local_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reference_locations_project_geo
ON public.reference_locations (project_id, state, lga, ward);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_submitted_created_id
ON public.form_submissions (form_id, submitted_at DESC NULLS LAST, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status_submitted_id
ON public.form_submissions (status, submitted_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_user_created
ON public.form_submissions (form_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_mda_checklist_form(_name text, _settings jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(_settings ->> 'isMdaChecklist', '') IN ('true', '1')
    OR COALESCE(_settings ->> 'mdaChecklist', '') IN ('true', '1')
    OR COALESCE(_settings ->> 'coverageEvaluation', '') IN ('true', '1')
    OR lower(COALESCE(_name, '')) LIKE '%integrated mda supervisory checklist%'
    OR lower(COALESCE(_name, '')) LIKE '%mda supervisory checklist%';
$$;

REVOKE ALL ON FUNCTION public.is_mda_checklist_form(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_mda_checklist_form(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mda_checklist_form(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.accessible_project_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT project_id), ARRAY[]::uuid[])
  FROM (
    SELECT upa.project_id
    FROM public.user_project_assignments upa
    WHERE upa.user_id = _user_id

    UNION

    SELECT da.project_id
    FROM public.dashboard_access da
    WHERE da.user_id = _user_id
      AND da.project_id IS NOT NULL

    UNION

    SELECT f.project_id
    FROM public.dashboard_access da
    JOIN public.forms f
      ON da.project_id IS NULL
     AND public.is_mda_checklist_form(f.name, f.settings)
    WHERE da.user_id = _user_id
      AND da.dashboard_id = 'mda_supervisory'
  ) visible
  WHERE project_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.accessible_form_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH project_scope AS (
    SELECT unnest(public.accessible_project_ids(_user_id)) AS project_id
  )
  SELECT COALESCE(array_agg(DISTINCT form_id), ARRAY[]::uuid[])
  FROM (
    SELECT ufa.form_id
    FROM public.user_form_assignments ufa
    WHERE ufa.user_id = _user_id

    UNION

    SELECT sfa.form_id
    FROM public.sarmaan_form_access sfa
    WHERE sfa.user_id = _user_id

    UNION

    SELECT f.id AS form_id
    FROM public.forms f
    JOIN project_scope ps ON ps.project_id = f.project_id

    UNION

    SELECT f.id AS form_id
    FROM public.forms f
    JOIN public.dashboard_access da
      ON da.user_id = _user_id
     AND da.dashboard_id = 'mda_supervisory'
     AND (da.project_id IS NULL OR da.project_id = f.project_id)
    WHERE public.is_mda_checklist_form(f.name, f.settings)
  ) visible
  WHERE form_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_project_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accessible_form_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_form_ids(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_view_form_submissions(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _form_id = ANY(public.accessible_form_ids(_user_id));
$$;

REVOKE ALL ON FUNCTION public.can_view_form_submissions(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_form_submissions(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_form_submissions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_form_submissions(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Users read reference locations in scope" ON public.reference_locations;
CREATE POLICY "Users read reference locations in scope"
ON public.reference_locations
FOR SELECT
TO authenticated
USING (
  project_id IS NULL
  OR created_by = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
  OR public.is_owner_or_co_owner((SELECT auth.uid()))
  OR project_id = ANY(public.accessible_project_ids((SELECT auth.uid())))
);

CREATE OR REPLACE FUNCTION public.visible_form_submission_counts(_form_ids uuid[])
RETURNS TABLE(form_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT
      (SELECT auth.uid()) AS uid,
      public.is_admin((SELECT auth.uid())) AS can_admin,
      public.is_owner_or_co_owner((SELECT auth.uid())) AS can_owner,
      public.accessible_form_ids((SELECT auth.uid())) AS allowed_forms
  ), requested AS (
    SELECT DISTINCT unnest(COALESCE(_form_ids, ARRAY[]::uuid[])) AS form_id
  )
  SELECT r.form_id, count(fs.id)::bigint AS total
  FROM requested r
  CROSS JOIN scope s
  LEFT JOIN public.form_submissions fs
    ON fs.form_id = r.form_id
   AND (
      s.can_admin
      OR s.can_owner
      OR fs.form_id = ANY(s.allowed_forms)
      OR fs.user_id = s.uid
   )
  GROUP BY r.form_id;
$$;

CREATE OR REPLACE FUNCTION public.visible_form_submissions(
  _form_id uuid,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  form_id uuid,
  user_id uuid,
  data jsonb,
  location jsonb,
  within_geofence boolean,
  status text,
  submitted_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  submission_type text,
  submission_uuid uuid,
  client_submitted_at timestamptz,
  version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT
      (SELECT auth.uid()) AS uid,
      public.is_admin((SELECT auth.uid())) AS can_admin,
      public.is_owner_or_co_owner((SELECT auth.uid())) AS can_owner,
      public.accessible_form_ids((SELECT auth.uid())) AS allowed_forms
  )
  SELECT
    fs.id, fs.form_id, fs.user_id, fs.data, fs.location, fs.within_geofence,
    fs.status, fs.submitted_at, fs.synced_at, fs.created_at, fs.updated_at,
    fs.submission_type, fs.submission_uuid, fs.client_submitted_at, fs.version
  FROM public.form_submissions fs
  CROSS JOIN scope s
  WHERE fs.form_id = _form_id
    AND (
      s.can_admin
      OR s.can_owner
      OR fs.form_id = ANY(s.allowed_forms)
      OR fs.user_id = s.uid
    )
  ORDER BY fs.submitted_at DESC NULLS LAST, fs.created_at DESC, fs.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 1000)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.visible_form_submissions_for_forms(
  _form_ids uuid[],
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  form_id uuid,
  user_id uuid,
  data jsonb,
  location jsonb,
  within_geofence boolean,
  status text,
  submitted_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  submission_type text,
  submission_uuid uuid,
  client_submitted_at timestamptz,
  version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT
      (SELECT auth.uid()) AS uid,
      public.is_admin((SELECT auth.uid())) AS can_admin,
      public.is_owner_or_co_owner((SELECT auth.uid())) AS can_owner,
      public.accessible_form_ids((SELECT auth.uid())) AS allowed_forms
  )
  SELECT
    fs.id, fs.form_id, fs.user_id, fs.data, fs.location, fs.within_geofence,
    fs.status, fs.submitted_at, fs.synced_at, fs.created_at, fs.updated_at,
    fs.submission_type, fs.submission_uuid, fs.client_submitted_at, fs.version
  FROM public.form_submissions fs
  CROSS JOIN scope s
  WHERE fs.form_id = ANY(COALESCE(_form_ids, ARRAY[]::uuid[]))
    AND (
      s.can_admin
      OR s.can_owner
      OR fs.form_id = ANY(s.allowed_forms)
      OR fs.user_id = s.uid
    )
  ORDER BY fs.submitted_at DESC NULLS LAST, fs.created_at DESC, fs.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 1000)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.visible_form_submission_counts(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_form_submission_counts(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submission_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_form_submission_counts(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.visible_form_submissions(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_form_submissions(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.visible_form_submissions_for_forms(uuid[], integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_form_submissions_for_forms(uuid[], integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions_for_forms(uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions_for_forms(uuid[], integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.jsonb_replace_local_reference_ids(_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  elem jsonb;
  key text;
  child_value jsonb;
  original_text text;
  resolved_id text;
BEGIN
  IF _value IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(_value) = 'string' THEN
    original_text := trim(both '"' from _value::text);
    IF original_text LIKE 'local-%' THEN
      SELECT rl.id::text INTO resolved_id
      FROM public.reference_locations rl
      WHERE rl.local_ref = original_text
      ORDER BY rl.created_at ASC
      LIMIT 1;
      IF resolved_id IS NOT NULL THEN
        RETURN to_jsonb(resolved_id);
      END IF;
    END IF;
    RETURN _value;
  ELSIF jsonb_typeof(_value) = 'array' THEN
    result := '[]'::jsonb;
    FOR elem IN SELECT jsonb_array_elements(_value) LOOP
      result := result || jsonb_build_array(public.jsonb_replace_local_reference_ids(elem));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(_value) = 'object' THEN
    result := '{}'::jsonb;
    FOR key, child_value IN SELECT * FROM jsonb_each(_value) LOOP
      result := result || jsonb_build_object(key, public.jsonb_replace_local_reference_ids(child_value));
    END LOOP;
    RETURN result;
  END IF;

  RETURN _value;
END;
$$;

REVOKE ALL ON FUNCTION public.jsonb_replace_local_reference_ids(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jsonb_replace_local_reference_ids(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.jsonb_replace_local_reference_ids(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_mda_offline_rewritten_keys()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_run_id uuid;
  v_form_ids uuid[];
  v_forms_scanned integer := 0;
  v_submissions_scanned integer := 0;
  v_submissions_rewritten integer := 0;
  v_references_scanned integer := 0;
  v_references_promoted integer := 0;
BEGIN
  INSERT INTO public.mda_sync_job_runs (status)
  VALUES ('running')
  RETURNING id INTO v_run_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)::integer
  INTO v_form_ids, v_forms_scanned
  FROM public.forms
  WHERE public.is_mda_checklist_form(name, settings);

  SELECT count(*)::integer
  INTO v_submissions_scanned
  FROM public.form_submissions
  WHERE form_id = ANY(v_form_ids)
    AND data::text LIKE '%local-%';

  WITH rewritten AS (
    SELECT fs.id, public.jsonb_replace_local_reference_ids(fs.data) AS new_data
    FROM public.form_submissions fs
    WHERE fs.form_id = ANY(v_form_ids)
      AND fs.data::text LIKE '%local-%'
  ), changed AS (
    UPDATE public.form_submissions fs
    SET data = r.new_data,
        updated_at = now()
    FROM rewritten r
    WHERE fs.id = r.id
      AND fs.data IS DISTINCT FROM r.new_data
    RETURNING fs.id
  )
  SELECT count(*)::integer INTO v_submissions_rewritten FROM changed;

  SELECT count(*)::integer
  INTO v_references_scanned
  FROM public.reference_locations
  WHERE local_ref IS NOT NULL;

  WITH resolved_parents AS (
    SELECT child.id, parent.id AS server_parent_id
    FROM public.reference_locations child
    JOIN public.reference_locations parent
      ON child.parent_id::text = parent.local_ref
    WHERE child.parent_id::text LIKE 'local-%'
  ), promoted AS (
    UPDATE public.reference_locations rl
    SET parent_id = rp.server_parent_id,
        updated_at = now()
    FROM resolved_parents rp
    WHERE rl.id = rp.id
      AND rl.parent_id IS DISTINCT FROM rp.server_parent_id
    RETURNING rl.id
  )
  SELECT count(*)::integer INTO v_references_promoted FROM promoted;

  UPDATE public.mda_sync_job_runs
  SET finished_at = now(),
      status = 'succeeded',
      forms_scanned = v_forms_scanned,
      submissions_scanned = v_submissions_scanned,
      submissions_rewritten = v_submissions_rewritten,
      references_scanned = v_references_scanned,
      references_promoted = v_references_promoted,
      details = jsonb_build_object(
        'form_ids', v_form_ids,
        'ran_at', now()
      )
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'forms_scanned', v_forms_scanned,
    'submissions_scanned', v_submissions_scanned,
    'submissions_rewritten', v_submissions_rewritten,
    'references_scanned', v_references_scanned,
    'references_promoted', v_references_promoted
  );
EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    UPDATE public.mda_sync_job_runs
    SET finished_at = now(), status = 'failed', error = SQLERRM
    WHERE id = v_run_id;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mda_offline_rewritten_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_mda_offline_rewritten_keys() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_mda_offline_rewritten_keys() TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_mda_sync_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.sync_mda_offline_rewritten_keys();
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_mda_sync_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_mda_sync_job() FROM anon;
GRANT EXECUTE ON FUNCTION public.invoke_mda_sync_job() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-mda-offline-key-sync') THEN
    PERFORM cron.unschedule('nightly-mda-offline-key-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'nightly-mda-offline-key-sync',
  '17 2 * * *',
  $$SELECT public.invoke_mda_sync_job();$$
);