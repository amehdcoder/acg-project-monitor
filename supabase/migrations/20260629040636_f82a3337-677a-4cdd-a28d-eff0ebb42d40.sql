CREATE OR REPLACE FUNCTION public.owner_cascade_delete_ces(
  _project_id uuid,
  _communities text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _survey_ids uuid[];
  _deleted int := 0;
BEGIN
  IF NOT public.is_owner_level(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'project_id required';
  END IF;

  -- Resolve the CES surveys to remove: all in the project, or only those whose
  -- community matches one of the supplied (lower/trimmed) community names.
  IF _communities IS NULL OR array_length(_communities, 1) IS NULL THEN
    SELECT array_agg(id) INTO _survey_ids FROM public.ces_surveys WHERE project_id = _project_id;
  ELSE
    SELECT array_agg(id) INTO _survey_ids
    FROM public.ces_surveys
    WHERE project_id = _project_id
      AND lower(btrim(coalesce(community_name, ''))) = ANY(_communities);
  END IF;

  IF _survey_ids IS NOT NULL AND array_length(_survey_ids, 1) IS NOT NULL THEN
    DELETE FROM public.ces_household_visits   WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_segment_resamples  WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_peer_validations   WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_mopup_assignments  WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_gap_clusters       WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_feature_labels     WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_segments           WHERE survey_id = ANY(_survey_ids);
    DELETE FROM public.ces_surveys            WHERE id = ANY(_survey_ids);
    GET DIAGNOSTICS _deleted = ROW_COUNT;
  END IF;

  -- On a full project clear, also wipe the capture-session lineage (the raw
  -- 2.5D capture households/keyframes that feed the coverage map).
  IF _communities IS NULL OR array_length(_communities, 1) IS NULL THEN
    DELETE FROM public.ces_households
      WHERE session_id IN (SELECT id FROM public.ces_capture_sessions WHERE project_id = _project_id);
    DELETE FROM public.ces_keyframes
      WHERE session_id IN (SELECT id FROM public.ces_capture_sessions WHERE project_id = _project_id);
    DELETE FROM public.ces_fenced_communities WHERE project_id = _project_id;
    DELETE FROM public.ces_capture_sessions   WHERE project_id = _project_id;
  END IF;

  RETURN jsonb_build_object('deleted_surveys', _deleted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_cascade_delete_ces(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_cascade_delete_ces(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cascade_delete_ces(uuid, text[]) TO service_role;