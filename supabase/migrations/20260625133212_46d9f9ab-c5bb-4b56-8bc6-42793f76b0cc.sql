CREATE OR REPLACE FUNCTION public.current_user_can_build_mda_followups()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR public.is_owner_or_co_owner(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.enforce_followup_builder_admin_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_followup_names text[] := ARRAY[
    'follow_up_on_mda_completion',
    'follow_up_on_mda_commodities',
    'adverse_reaction_management',
    'follow_up_on_adverse_reactions',
    'follow_up_on_mda_adverse_reactions',
    'follow_up_on_mda_communities'
  ];
  v_old_group jsonb;
  v_new_group jsonb;
  v_old_key text;
  v_new_key text;
  v_old_group_match jsonb;
BEGIN
  IF COALESCE((NEW.settings->>'isMdaChecklist')::boolean, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.questions IS NULL OR jsonb_typeof(NEW.questions) <> 'array' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.current_user_can_build_mda_followups() THEN
      FOR v_new_group IN SELECT * FROM jsonb_array_elements(NEW.questions)
      LOOP
        IF jsonb_typeof(v_new_group) = 'object'
          AND (v_new_group->>'name') = ANY (v_followup_names)
          AND (
            COALESCE(NULLIF(v_new_group->>'communityFilter', ''), '') <> ''
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(v_new_group->'questions', '[]'::jsonb)) q
              WHERE COALESCE(NULLIF(q->>'linkedSourceField', ''), '') <> ''
            )
          )
        THEN
          RAISE EXCEPTION 'Only Systems Admin, Super Admin, Owner, and Co-owner can create or edit MDA follow-up question linkages.'
            USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF public.current_user_can_build_mda_followups() THEN
    RETURN NEW;
  END IF;

  FOR v_new_group IN SELECT * FROM jsonb_array_elements(NEW.questions)
  LOOP
    IF jsonb_typeof(v_new_group) <> 'object' OR NOT ((v_new_group->>'name') = ANY (v_followup_names)) THEN
      CONTINUE;
    END IF;

    v_new_key := COALESCE(v_new_group->>'id', v_new_group->>'name');
    v_old_group_match := NULL;

    IF OLD.questions IS NOT NULL AND jsonb_typeof(OLD.questions) = 'array' THEN
      FOR v_old_group IN SELECT * FROM jsonb_array_elements(OLD.questions)
      LOOP
        IF jsonb_typeof(v_old_group) <> 'object' THEN
          CONTINUE;
        END IF;
        v_old_key := COALESCE(v_old_group->>'id', v_old_group->>'name');
        IF v_old_key = v_new_key THEN
          v_old_group_match := v_old_group;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_old_group_match IS NULL OR COALESCE(v_old_group_match, '{}'::jsonb) <> v_new_group THEN
      RAISE EXCEPTION 'Only Systems Admin, Super Admin, Owner, and Co-owner can create or edit MDA follow-up question linkages.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_followup_builder_admin_guard_trg ON public.forms;
CREATE TRIGGER enforce_followup_builder_admin_guard_trg
  BEFORE INSERT OR UPDATE ON public.forms
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_followup_builder_admin_guard();