CREATE OR REPLACE FUNCTION public.visible_form_submission_counts(_form_ids uuid[])
RETURNS TABLE(form_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.visible_form_submission_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_form_submission_counts(uuid[]) TO authenticated, service_role;