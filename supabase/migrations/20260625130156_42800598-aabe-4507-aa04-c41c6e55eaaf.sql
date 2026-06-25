CREATE OR REPLACE FUNCTION public.enforce_followup_question_linking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_followup_names text[] := ARRAY[
    'follow_up_on_mda_completion',
    'follow_up_on_mda_commodities',
    'adverse_reaction_management'
  ];
  v_group jsonb;
  v_q jsonb;
  v_has_questions boolean;
  v_has_link boolean;
  v_label text;
BEGIN
  IF NEW.questions IS NULL OR jsonb_typeof(NEW.questions) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(NEW.questions)
  LOOP
    -- Only validate objects that look like follow-up groups.
    IF jsonb_typeof(v_group) <> 'object' THEN
      CONTINUE;
    END IF;

    IF NOT ((v_group->>'name') = ANY (v_followup_names)) THEN
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_group->'questions') <> 'array' THEN
      CONTINUE;
    END IF;

    v_has_questions := false;
    v_has_link := false;

    FOR v_q IN SELECT * FROM jsonb_array_elements(v_group->'questions')
    LOOP
      v_has_questions := true;
      IF COALESCE(NULLIF(TRIM(v_q->>'linkedSourceField'), ''), NULL) IS NOT NULL THEN
        v_has_link := true;
        EXIT;
      END IF;
    END LOOP;

    -- Groups with questions must have at least one linked question.
    IF v_has_questions AND NOT v_has_link THEN
      v_label := COALESCE(NULLIF(TRIM(v_group->>'label'), ''), v_group->>'name');
      RAISE EXCEPTION 'Follow-up module "%" must have at least one follow-up question linked to a Community Checklist response before it can be saved.', v_label
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_followup_question_linking_trg ON public.forms;
CREATE TRIGGER enforce_followup_question_linking_trg
  BEFORE INSERT OR UPDATE ON public.forms
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_followup_question_linking();