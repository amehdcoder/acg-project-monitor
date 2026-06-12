
-- 1. Official group should contain ALL active HANDS staff (by designation), not just project-assigned ones,
--    and must purge any non-HANDS-staff members.
CREATE OR REPLACE FUNCTION public.ensure_hands_staff_group(_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_me uuid := auth.uid();
  v_icon text := 'https://vhuixgcjmrmfowzrulac.supabase.co/storage/v1/object/public/avatars/system%2Fhands-staff-official.png';
BEGIN
  IF v_me IS NULL OR _project_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_admin(v_me)
    OR public.is_owner(v_me)
    OR EXISTS (SELECT 1 FROM public.user_project_assignments WHERE project_id = _project_id AND user_id = v_me)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_group_id
  FROM public.chat_groups
  WHERE project_id = _project_id AND name = 'HANDS Staff - Official'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.chat_groups (project_id, name, description, created_by, is_default, is_protected, icon_url)
    VALUES (_project_id, 'HANDS Staff - Official',
            'Official channel for HANDS staff on this project.',
            v_me, true, true, v_icon)
    RETURNING id INTO v_group_id;
  ELSE
    UPDATE public.chat_groups
    SET is_protected = true,
        icon_url = COALESCE(icon_url, v_icon)
    WHERE id = v_group_id;
  END IF;

  -- Add EVERY active HANDS staff member (by designation), regardless of project assignment.
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT v_group_id, p.user_id, 'member', v_me
  FROM public.profiles p
  WHERE p.designation = 'hands_staff'
    AND COALESCE(p.is_active, true) = true
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;

  -- Remove anyone in the group who is NOT a HANDS staff member.
  DELETE FROM public.chat_group_members m
  USING public.profiles p
  WHERE m.chat_group_id = v_group_id
    AND p.user_id = m.user_id
    AND COALESCE(p.designation::text, '') <> 'hands_staff';

  RETURN v_group_id;
END;
$function$;

-- 2. When a brand-new chat group is created, do not bulk-add all project members to a protected group.
CREATE OR REPLACE FUNCTION public.sync_new_chat_group_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.is_protected, false) = true THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT NEW.id, upa.user_id, 'member', NEW.created_by
  FROM public.user_project_assignments upa
  WHERE upa.project_id = NEW.project_id
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3. When a user is assigned to a project, add them to that project's groups EXCEPT protected ones.
CREATE OR REPLACE FUNCTION public.sync_project_assignment_chat_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT cg.id, NEW.user_id, 'member', COALESCE(NEW.assigned_by, NEW.user_id)
  FROM public.chat_groups cg
  WHERE cg.project_id = NEW.project_id
    AND COALESCE(cg.is_protected, false) = false
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 4. Hard safeguard: block any non-HANDS-staff from being added to the official protected group.
CREATE OR REPLACE FUNCTION public.guard_hands_staff_group_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_groups cg
    WHERE cg.id = NEW.chat_group_id
      AND cg.is_protected = true
      AND cg.name = 'HANDS Staff - Official'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = NEW.user_id
        AND p.designation::text = 'hands_staff'
    ) THEN
      RAISE EXCEPTION 'Only HANDS Staff can be added to the HANDS Staff - Official group';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_hands_staff_membership ON public.chat_group_members;
CREATE TRIGGER guard_hands_staff_membership
  BEFORE INSERT ON public.chat_group_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_hands_staff_group_membership();
