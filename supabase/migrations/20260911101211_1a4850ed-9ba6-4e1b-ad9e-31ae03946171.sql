
-- 1. Idempotency + conflict-resolution columns on cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS submission_uuid uuid,
  ADD COLUMN IF NOT EXISTS client_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS cases_submission_uuid_key
  ON public.cases (submission_uuid) WHERE submission_uuid IS NOT NULL;

-- 2. Compound indexes for high-frequency concurrent reads
CREATE INDEX IF NOT EXISTS idx_cases_project_created_desc
  ON public.cases (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_project_status
  ON public.cases (project_id, status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_device_created
  ON public.form_submissions (device_id, created_at DESC);

-- 3. Atomic ingestion of a batch of form submissions.
--    Whole batch runs in one transaction; duplicates by submission_uuid are
--    ignored and still reported as accepted so retries are safe.
CREATE OR REPLACE FUNCTION public.ingest_form_submissions(_rows jsonb)
RETURNS TABLE(accepted_uuid uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH incoming AS (
    SELECT
      (r->>'id')::uuid                AS id,
      (r->>'submission_uuid')::uuid   AS submission_uuid,
      (r->>'form_id')::uuid           AS form_id,
      (r->>'user_id')::uuid           AS user_id,
      COALESCE(r->'data', '{}'::jsonb) AS data,
      CASE WHEN r->'location' = 'null'::jsonb OR r->'location' IS NULL
           THEN NULL ELSE r->'location' END AS location,
      CASE WHEN r->>'within_geofence' IS NULL THEN NULL
           ELSE (r->>'within_geofence')::boolean END AS within_geofence,
      COALESCE(r->>'submission_type', 'regular') AS submission_type,
      COALESCE((r->>'submitted_at')::timestamptz, now()) AS submitted_at,
      COALESCE((r->>'client_submitted_at')::timestamptz,
               (r->>'submitted_at')::timestamptz, now())  AS client_submitted_at,
      r->>'device_id'        AS device_id,
      r->>'collector_label'  AS collector_label
    FROM jsonb_array_elements(_rows) AS r
  ), ins AS (
    INSERT INTO public.form_submissions AS fs (
      id, submission_uuid, form_id, user_id, data, location, within_geofence,
      submission_type, status, submitted_at, synced_at, client_submitted_at,
      device_id, collector_label
    )
    SELECT id, COALESCE(submission_uuid, id), form_id, user_id, data, location,
           within_geofence, submission_type, 'sent', submitted_at, now(),
           client_submitted_at, device_id, collector_label
    FROM incoming
    ON CONFLICT (id) DO NOTHING
    RETURNING fs.submission_uuid
  )
  SELECT i.submission_uuid FROM ins i
  UNION
  SELECT COALESCE(inc.submission_uuid, inc.id)
  FROM incoming inc
  WHERE EXISTS (
    SELECT 1 FROM public.form_submissions f
    WHERE f.id = inc.id
       OR (inc.submission_uuid IS NOT NULL AND f.submission_uuid = inc.submission_uuid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_form_submissions(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_form_submissions(jsonb) TO service_role;

-- 4. Atomic ingestion of offline cases with last-write-wins conflict resolution.
CREATE OR REPLACE FUNCTION public.ingest_cases(_rows jsonb)
RETURNS TABLE(accepted_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH incoming AS (
    SELECT
      (r->>'id')::uuid              AS id,
      (r->>'case_type_id')::uuid    AS case_type_id,
      (r->>'project_id')::uuid      AS project_id,
      (r->>'owner_id')::uuid        AS owner_id,
      LEFT(COALESCE(r->>'name', 'Case'), 200) AS name,
      COALESCE(r->'properties', '{}'::jsonb)  AS properties,
      COALESCE(r->>'status', 'open')          AS status,
      COALESCE((r->>'opened_at')::timestamptz, now())          AS opened_at,
      COALESCE((r->>'client_submitted_at')::timestamptz, now()) AS client_submitted_at
    FROM jsonb_array_elements(_rows) AS r
  ), ups AS (
    INSERT INTO public.cases AS c (
      id, submission_uuid, case_type_id, project_id, owner_id, opened_by,
      last_modified_by, name, properties, status, opened_at,
      client_submitted_at, last_modified_at, version
    )
    SELECT id, id, case_type_id, project_id, owner_id, owner_id, owner_id,
           name, properties, status, opened_at, client_submitted_at, now(), 1
    FROM incoming
    ON CONFLICT (id) DO UPDATE
      SET properties          = EXCLUDED.properties,
          name                = EXCLUDED.name,
          status              = EXCLUDED.status,
          client_submitted_at = EXCLUDED.client_submitted_at,
          last_modified_at    = now(),
          last_modified_by    = EXCLUDED.last_modified_by,
          version             = c.version + 1
      -- last-write-wins: only newer on-device captures overwrite.
      WHERE EXCLUDED.client_submitted_at >= COALESCE(c.client_submitted_at, 'epoch'::timestamptz)
    RETURNING c.id
  )
  SELECT inc.id FROM incoming inc
  WHERE EXISTS (SELECT 1 FROM ups u WHERE u.id = inc.id)
     OR EXISTS (SELECT 1 FROM public.cases c2 WHERE c2.id = inc.id);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_cases(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_cases(jsonb) TO service_role;

-- 5. Lock-free device activity aggregation (replaces per-sync counter updates).
CREATE OR REPLACE VIEW public.project_device_activity
WITH (security_invoker = true) AS
SELECT d.id                AS device_row_id,
       d.project_id,
       d.device_id,
       d.label,
       d.last_seen_at,
       COUNT(fs.id)        AS records_received,
       MAX(fs.created_at)  AS last_record_at
FROM public.project_devices d
LEFT JOIN public.form_submissions fs ON fs.device_id = d.device_id
GROUP BY d.id, d.project_id, d.device_id, d.label, d.last_seen_at;

GRANT SELECT ON public.project_device_activity TO authenticated;
GRANT SELECT ON public.project_device_activity TO service_role;
