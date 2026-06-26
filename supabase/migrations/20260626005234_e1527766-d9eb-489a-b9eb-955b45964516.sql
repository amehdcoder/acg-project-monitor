DO $mig$
DECLARE
  v_src public.forms%ROWTYPE;
  v_qtext text;
  v_q jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_group jsonb;
  v_newq jsonb;
  v_question jsonb;
  v_name text;
  v_label text;
  v_opts jsonb;
  v_newid uuid := gen_random_uuid();
  v_settings jsonb;
BEGIN
  SELECT * INTO v_src FROM public.forms WHERE id = 'e917a5c9-f8de-4365-95b9-b52ff319c043';

  -- 1) Remove every mention of School / Teacher from all labels, hints and options
  v_qtext := v_src.questions::text;
  v_qtext := replace(v_qtext, 'CDDs (Community)/ Teachers (School)', 'CDDs');
  v_qtext := replace(v_qtext, 'Teachers/CDDs', 'CDDs');
  v_qtext := replace(v_qtext, 'Teacher/CDD', 'CDD');
  v_qtext := replace(v_qtext, 'CDD/Teacher', 'CDD');
  v_qtext := replace(v_qtext, 'Teachers', 'CDDs');
  v_qtext := replace(v_qtext, 'Teacher', 'CDD');
  v_qtext := replace(v_qtext, ' (School)', '');
  v_qtext := replace(v_qtext, ' (Community)', '');
  v_qtext := replace(v_qtext, 'the Community/School', 'the Community');
  v_qtext := replace(v_qtext, 'Community/School', 'Community');
  v_qtext := replace(v_qtext, 'the School/Community', 'the Community');
  v_qtext := replace(v_qtext, 'School/Community', 'Community');
  v_qtext := replace(v_qtext, 'in the School', 'in the Community');
  v_qtext := replace(v_qtext, 'the School', 'the Community');
  v_qtext := replace(v_qtext, 'School', 'Community');
  v_qtext := replace(v_qtext, 'in Community', 'in the Community');
  v_q := v_qtext::jsonb;

  -- 2) Rebuild groups: drop Location Type + school-only (pupil) questions; restrict cascade to Jigawa
  FOR v_group IN SELECT * FROM jsonb_array_elements(v_q)
  LOOP
    v_newq := '[]'::jsonb;
    FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(v_group->'questions', '[]'::jsonb))
    LOOP
      v_name := v_question->>'name';
      v_label := COALESCE(v_question->>'label', '');
      IF v_name = 'location_type' THEN CONTINUE; END IF;
      IF v_label ILIKE '%pupil%' THEN CONTINUE; END IF;
      IF v_name = 'state' THEN
        v_opts := (SELECT jsonb_agg(o) FROM jsonb_array_elements(v_question->'options') o WHERE o->>'value' = 'jigawa');
        v_question := jsonb_set(v_question, '{options}', COALESCE(v_opts, '[]'::jsonb));
        v_question := jsonb_set(v_question, '{defaultValue}', '"jigawa"'::jsonb);
      ELSIF v_name = 'lga' THEN
        v_opts := (SELECT jsonb_agg(o) FROM jsonb_array_elements(v_question->'options') o WHERE o->>'parentValue' = 'jigawa');
        v_question := jsonb_set(v_question, '{options}', COALESCE(v_opts, '[]'::jsonb));
      ELSIF v_name = 'ward' THEN
        v_opts := (SELECT jsonb_agg(o) FROM jsonb_array_elements(v_question->'options') o WHERE (o->>'parentValue') LIKE 'jigawa\_\_%');
        v_question := jsonb_set(v_question, '{options}', COALESCE(v_opts, '[]'::jsonb));
      END IF;
      v_newq := v_newq || v_question;
    END LOOP;
    v_group := jsonb_set(v_group, '{questions}', v_newq);
    v_groups := v_groups || v_group;
  END LOOP;

  v_settings := COALESCE(v_src.settings, '{}'::jsonb)
    || '{"copiedFromProject":"ENDFUND","stateRestricted":"jigawa"}'::jsonb;

  -- 3) Replace the standard Jigawa checklist with the copied one (admin copy: bypass app-user triggers)
  SET session_replication_role = replica;

  UPDATE public.form_submissions SET form_id = v_newid
    WHERE form_id = '8729ca21-99bc-41ed-b93b-f2ebe1912fa1';
  DELETE FROM public.forms WHERE id = '8729ca21-99bc-41ed-b93b-f2ebe1912fa1';

  INSERT INTO public.forms (id, project_id, name, description, questions, settings, status, created_by, created_at, updated_at)
  VALUES (v_newid, 'ff410194-f713-4852-9dca-c0367e14ff7e', v_src.name, v_src.description, v_groups, v_settings, 'draft', v_src.created_by, now(), now());

  SET session_replication_role = DEFAULT;
END
$mig$;