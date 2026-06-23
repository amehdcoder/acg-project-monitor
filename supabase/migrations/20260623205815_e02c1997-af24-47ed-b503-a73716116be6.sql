CREATE OR REPLACE FUNCTION public.supervisor_user_metrics(
  _today_start timestamptz,
  _today_end timestamptz,
  _range_from timestamptz,
  _range_to timestamptz
)
RETURNS TABLE (
  user_id uuid,
  subs_today bigint,
  subs_total bigint,
  geo_within bigint,
  geo_total bigint,
  today_min timestamptz,
  today_max timestamptz,
  last_submission_at timestamptz,
  last_location jsonb,
  last_data jsonb,
  form_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH today AS (
    SELECT s.user_id,
           count(*) AS subs_today,
           min(s.submitted_at) AS today_min,
           max(s.submitted_at) AS today_max
    FROM public.form_submissions s
    WHERE s.status = 'sent'
      AND s.submitted_at >= _today_start
      AND s.submitted_at <= _today_end
    GROUP BY s.user_id
  ),
  rng AS (
    SELECT s.user_id,
           count(*) AS subs_total,
           count(*) FILTER (WHERE s.within_geofence IS NOT NULL) AS geo_total,
           count(*) FILTER (WHERE s.within_geofence IS TRUE) AS geo_within
    FROM public.form_submissions s
    WHERE s.status = 'sent'
      AND s.submitted_at >= _range_from
      AND s.submitted_at <= _range_to
    GROUP BY s.user_id
  ),
  fids AS (
    SELECT s.user_id, array_agg(DISTINCT s.form_id) AS form_ids
    FROM public.form_submissions s
    WHERE s.status = 'sent'
      AND s.submitted_at >= LEAST(_today_start, _range_from)
      AND s.submitted_at <= GREATEST(_today_end, _range_to)
    GROUP BY s.user_id
  ),
  last_today AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id, s.submitted_at, s.location, s.data
    FROM public.form_submissions s
    WHERE s.status = 'sent'
      AND s.submitted_at >= _today_start
      AND s.submitted_at <= _today_end
    ORDER BY s.user_id, s.submitted_at DESC
  ),
  ids AS (
    SELECT t.user_id FROM today t
    UNION
    SELECT r.user_id FROM rng r
    UNION
    SELECT f.user_id FROM fids f
  )
  SELECT
    u.user_id,
    COALESCE(t.subs_today, 0)::bigint,
    COALESCE(r.subs_total, 0)::bigint,
    COALESCE(r.geo_within, 0)::bigint,
    COALESCE(r.geo_total, 0)::bigint,
    t.today_min,
    t.today_max,
    lt.submitted_at,
    lt.location,
    lt.data,
    COALESCE(f.form_ids, '{}')::uuid[]
  FROM ids u
  LEFT JOIN today t ON t.user_id = u.user_id
  LEFT JOIN rng r ON r.user_id = u.user_id
  LEFT JOIN fids f ON f.user_id = u.user_id
  LEFT JOIN last_today lt ON lt.user_id = u.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.supervisor_hourly_submissions(
  _range_from timestamptz,
  _range_to timestamptz
)
RETURNS TABLE (hour int, cnt bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT EXTRACT(HOUR FROM (s.submitted_at AT TIME ZONE 'Africa/Lagos'))::int AS hour,
         count(*)::bigint AS cnt
  FROM public.form_submissions s
  WHERE s.status = 'sent'
    AND s.submitted_at >= _range_from
    AND s.submitted_at <= _range_to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_user_metrics(timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisor_hourly_submissions(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_user_metrics(timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_hourly_submissions(timestamptz, timestamptz) TO authenticated;