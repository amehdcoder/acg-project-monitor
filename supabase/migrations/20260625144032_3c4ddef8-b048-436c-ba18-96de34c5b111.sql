CREATE OR REPLACE FUNCTION public.owner_clear_form_submissions(_form_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_subs int := 0;
  v_versions int := 0;
  v_tracking int := 0;
  v_anomalies int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may clear checklist data';
  END IF;
  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'A form id is required';
  END IF;

  -- Remove dependent version snapshots first
  DELETE FROM public.submission_versions sv
  USING public.form_submissions fs
  WHERE sv.submission_id = fs.id AND fs.form_id = _form_id;
  GET DIAGNOSTICS v_versions = ROW_COUNT;

  DELETE FROM public.submission_anomalies WHERE form_id = _form_id;
  GET DIAGNOSTICS v_anomalies = ROW_COUNT;

  DELETE FROM public.form_tracking_events WHERE form_id = _form_id;
  GET DIAGNOSTICS v_tracking = ROW_COUNT;

  DELETE FROM public.form_submissions WHERE form_id = _form_id;
  GET DIAGNOSTICS v_subs = ROW_COUNT;

  RETURN jsonb_build_object(
    'cleared', true,
    'form_id', _form_id,
    'submissions_deleted', v_subs,
    'versions_deleted', v_versions,
    'tracking_deleted', v_tracking,
    'anomalies_deleted', v_anomalies,
    'at', now(),
    'by', v_user
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.owner_clear_form_submissions(uuid) TO authenticated;