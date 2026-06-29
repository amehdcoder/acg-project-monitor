CREATE OR REPLACE FUNCTION public.request_after_hours_submission(p_table text, p_payload jsonb, p_reason text, p_form_label text DEFAULT NULL::text, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_project uuid;
  v_obj jsonb;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (p_table = ANY (public._after_hours_allowed_tables())) THEN
    RAISE EXCEPTION 'Table % is not gated', p_table;
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  v_obj := CASE WHEN jsonb_typeof(p_payload) = 'array' THEN p_payload->0 ELSE p_payload END;

  v_project := p_project_id;
  IF v_project IS NULL AND v_obj ? 'project_id' AND (v_obj->>'project_id') <> '' THEN
    v_project := (v_obj->>'project_id')::uuid;
  END IF;
  IF v_project IS NULL AND v_obj ? 'form_id' THEN
    SELECT f.project_id INTO v_project FROM public.forms f WHERE f.id = (v_obj->>'form_id')::uuid;
  END IF;
  IF v_project IS NULL AND v_obj ? 'survey_id' THEN
    SELECT s.project_id INTO v_project FROM public.ces_surveys s WHERE s.id = (v_obj->>'survey_id')::uuid;
  END IF;

  SELECT COALESCE(NULLIF(btrim(concat_ws(' ', first_name, last_name)), ''), email)
    INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.after_hours_submission_requests
    (requested_by, requested_by_name, target_table, form_label, payload, project_id, reason)
  VALUES
    (auth.uid(), v_name, p_table, p_form_label, p_payload, v_project, btrim(p_reason))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;