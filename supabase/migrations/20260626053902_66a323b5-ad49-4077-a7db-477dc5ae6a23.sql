-- Project-scoped authorization for MDA follow-up linkage builder.
-- Owner/Co-owner bypass; Super/Systems Admins must be assigned to the form's project.
CREATE OR REPLACE FUNCTION public.current_user_can_build_mda_followups_for_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner_or_co_owner(auth.uid())
    OR (
      (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'systems_admin'))
      AND p_project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_project_assignments upa
        WHERE upa.user_id = auth.uid()
          AND upa.project_id = p_project_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_build_mda_followups_for_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_build_mda_followups_for_project(uuid) TO authenticated;

-- Strengthen the existing builder guard trigger to also require project assignment.
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
  v_authorized boolean;
BEGIN
  IF COALESCE((NEW.settings->>'isMdaChecklist')::boolean, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.questions IS NULL OR jsonb_typeof(NEW.questions) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Role AND project-assignment check (owner-level bypasses assignment).
  v_authorized := public.current_user_can_build_mda_followups_for_project(NEW.project_id);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_authorized THEN
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
          RAISE EXCEPTION 'Only Systems Admin, Super Admin, Owner, and Co-owner assigned to this project can create or edit MDA follow-up question linkages.'
            USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF v_authorized THEN
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
      RAISE EXCEPTION 'Only Systems Admin, Super Admin, Owner, and Co-owner assigned to this project can create or edit MDA follow-up question linkages.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;