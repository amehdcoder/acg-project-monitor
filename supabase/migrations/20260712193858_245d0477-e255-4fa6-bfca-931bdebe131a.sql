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
  )
  SELECT fs.form_id, count(*)::bigint AS total
  FROM public.form_submissions fs
  CROSS JOIN scope s
  WHERE fs.form_id = ANY(_form_ids)
    AND (
      s.can_admin
      OR s.can_owner
      OR fs.form_id = ANY(s.allowed_forms)
      OR fs.user_id = s.uid
    )
  GROUP BY fs.form_id;
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
  submitted_at timestamp with time zone,
  synced_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  submission_type text,
  submission_uuid uuid,
  client_submitted_at timestamp with time zone,
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
    fs.id,
    fs.form_id,
    fs.user_id,
    fs.data,
    fs.location,
    fs.within_geofence,
    fs.status,
    fs.submitted_at,
    fs.synced_at,
    fs.created_at,
    fs.updated_at,
    fs.submission_type,
    fs.submission_uuid,
    fs.client_submitted_at,
    fs.version
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

REVOKE ALL ON FUNCTION public.visible_form_submission_counts(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_form_submission_counts(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submission_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_form_submission_counts(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.visible_form_submissions(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_form_submissions(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_form_submissions(uuid, integer, integer) TO service_role;