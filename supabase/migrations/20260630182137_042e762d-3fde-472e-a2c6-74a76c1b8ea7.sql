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
  v_cat text;
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

  -- Resolve the requester's display name. Profiles key the auth id on user_id.
  SELECT COALESCE(NULLIF(btrim(concat_ws(' ', first_name, last_name)), ''), email)
    INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  IF v_name IS NULL THEN
    SELECT email INTO v_name FROM auth.users WHERE id = auth.uid();
  END IF;

  -- Derive a specific form label. For ACSM/IRF category forms, use the
  -- human-readable category name instead of the generic table label.
  v_label := COALESCE(NULLIF(btrim(p_form_label), ''), NULL);
  IF p_table = 'irf_reports' THEN
    v_cat := v_obj->>'form_category';
    v_label := CASE v_cat
      WHEN 'advocacy_supervision' THEN 'Advocacy Supervision Form'
      WHEN 'town_announcers' THEN 'Town Announcers Supervision Form'
      WHEN 'compound_meeting' THEN 'Compound Meeting Form'
      WHEN 'community_dialogue' THEN 'Community Dialogue Form'
      ELSE COALESCE(v_label, 'SARMAAN ACSM Indicator Reporting Form (SAIRF)')
    END;
  END IF;
  v_label := COALESCE(v_label, p_table);

  INSERT INTO public.after_hours_submission_requests
    (requested_by, requested_by_name, target_table, form_label, payload, project_id, reason)
  VALUES
    (auth.uid(), v_name, p_table, v_label, p_payload, v_project, btrim(p_reason))
  RETURNING id INTO v_id;

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

-- Backfill existing requests whose requester name was lost due to the prior
-- (incorrect) profiles.id lookup, and upgrade generic IRF labels.
UPDATE public.after_hours_submission_requests r
SET requested_by_name = COALESCE(
      NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.email
    )
FROM public.profiles p
WHERE p.user_id = r.requested_by
  AND (r.requested_by_name IS NULL OR btrim(r.requested_by_name) = '');

UPDATE public.after_hours_submission_requests r
SET form_label = CASE r.payload->>'form_category'
      WHEN 'advocacy_supervision' THEN 'Advocacy Supervision Form'
      WHEN 'town_announcers' THEN 'Town Announcers Supervision Form'
      WHEN 'compound_meeting' THEN 'Compound Meeting Form'
      WHEN 'community_dialogue' THEN 'Community Dialogue Form'
      ELSE r.form_label
    END
WHERE r.target_table = 'irf_reports'
  AND r.payload->>'form_category' IS NOT NULL;