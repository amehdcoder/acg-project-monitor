-- Helper: list of reviewer user ids for a given project
CREATE OR REPLACE FUNCTION public._after_hours_reviewers(p_project_id uuid)
RETURNS TABLE(uid uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.user_id FROM public.profiles p WHERE p.is_owner = true AND p.user_id IS NOT NULL
  UNION
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
  UNION
  SELECT u.user_id FROM (
    SELECT ur.user_id AS user_id FROM public.user_roles ur WHERE ur.role = 'systems_admin'
    UNION
    SELECT p.user_id AS user_id FROM public.profiles p WHERE p.is_co_owner = true
  ) u
  WHERE p_project_id IS NOT NULL AND u.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_project_assignments upa
    WHERE upa.user_id = u.user_id AND upa.project_id = p_project_id
      AND (upa.starts_at IS NULL OR upa.starts_at <= now())
      AND (upa.expires_at IS NULL OR upa.expires_at > now())
  );
$$;

-- request: notify reviewers
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
  v_label text;
  rev record;
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

  v_label := COALESCE(p_form_label, p_table);

  -- Notify all reviewers for this project (skip the requester)
  FOR rev IN SELECT DISTINCT uid FROM public._after_hours_reviewers(v_project) WHERE uid <> auth.uid() LOOP
    INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
    VALUES (
      rev.uid,
      'warning',
      'After-hours approval needed',
      COALESCE(v_name, 'A user') || ' requested to submit "' || v_label || '" after hours. Reason: ' || btrim(p_reason),
      'after_hours',
      v_id::text
    );
  END LOOP;

  RETURN v_id;
END;
$function$;

-- approve: notify requester
CREATE OR REPLACE FUNCTION public.approve_after_hours_request(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; elem jsonb; obj jsonb;
BEGIN
  SELECT * INTO r FROM public.after_hours_submission_requests WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.can_review_after_hours(r.project_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  IF NOT (r.target_table = ANY (public._after_hours_allowed_tables())) THEN
    RAISE EXCEPTION 'Table not allowed';
  END IF;

  IF jsonb_typeof(r.payload) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(r.payload) LOOP
      obj := elem || jsonb_build_object('created_at', to_jsonb(r.created_at));
      PERFORM public._after_hours_insert_one(r.target_table, obj);
    END LOOP;
  ELSE
    obj := r.payload || jsonb_build_object('created_at', to_jsonb(r.created_at));
    PERFORM public._after_hours_insert_one(r.target_table, obj);
  END IF;

  UPDATE public.after_hours_submission_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_id;

  INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
  VALUES (
    r.requested_by,
    'success',
    'After-hours submission approved',
    'Your after-hours submission "' || COALESCE(r.form_label, r.target_table) || '" was approved and saved.',
    'after_hours',
    r.id::text
  );
END;
$function$;

-- reject: notify requester
CREATE OR REPLACE FUNCTION public.reject_after_hours_request(p_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.after_hours_submission_requests WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.can_review_after_hours(r.project_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  UPDATE public.after_hours_submission_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  WHERE id = p_id;

  INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
  VALUES (
    r.requested_by,
    'error',
    'After-hours submission rejected',
    'Your after-hours submission "' || COALESCE(r.form_label, r.target_table) || '" was rejected and discarded.'
      || CASE WHEN p_note IS NOT NULL AND btrim(p_note) <> '' THEN ' Note: ' || btrim(p_note) ELSE '' END,
    'after_hours',
    r.id::text
  );
END;
$function$;