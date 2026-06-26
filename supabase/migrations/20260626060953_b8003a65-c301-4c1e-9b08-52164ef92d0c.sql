-- 1. Canonical, cross-project HANDS Staff group: one shared group for all staff.
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
  IF v_me IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_admin(v_me)
    OR public.is_owner(v_me)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_me AND designation = 'hands_staff')
    OR (_project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_project_assignments WHERE project_id = _project_id AND user_id = v_me))
  ) THEN
    RETURN NULL;
  END IF;

  -- Reuse the single globally-canonical HANDS Staff group (earliest created),
  -- so every staff member shares ONE conversation regardless of project.
  SELECT id INTO v_group_id
  FROM public.chat_groups
  WHERE name = 'HANDS Staff - Official'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    IF _project_id IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.chat_groups (project_id, name, description, created_by, is_default, is_protected, icon_url)
    VALUES (_project_id, 'HANDS Staff - Official',
            'Official cross-project channel for all HANDS staff.',
            v_me, true, true, v_icon)
    RETURNING id INTO v_group_id;
  ELSE
    UPDATE public.chat_groups
    SET is_protected = true,
        icon_url = COALESCE(icon_url, v_icon)
    WHERE id = v_group_id;
  END IF;

  -- Add EVERY active HANDS staff member, regardless of project assignment.
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT v_group_id, p.user_id, 'member', v_me
  FROM public.profiles p
  WHERE p.designation = 'hands_staff'
    AND COALESCE(p.is_active, true) = true
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;

  -- Remove anyone who is no longer HANDS staff.
  DELETE FROM public.chat_group_members m
  USING public.profiles p
  WHERE m.chat_group_id = v_group_id
    AND p.user_id = m.user_id
    AND COALESCE(p.designation::text, '') <> 'hands_staff';

  RETURN v_group_id;
END;
$function$;

-- 2. List the chat groups the current user can use: project groups + any
-- protected (HANDS Staff) group they belong to, even across projects.
CREATE OR REPLACE FUNCTION public.get_my_chat_groups(_project_id uuid)
RETURNS SETOF public.chat_groups
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT g.* FROM public.chat_groups g
  WHERE g.project_id = _project_id
    AND public.user_can_access_chat_group(auth.uid(), g.id)
  UNION
  SELECT g.* FROM public.chat_groups g
  WHERE g.is_protected = true
    AND EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.chat_group_id = g.id AND m.user_id = auth.uid()
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_chat_groups(uuid) TO authenticated;

-- 3. Per-sender unread direct-message counts for the current user, used to
-- badge each "Active now" peer with the number of unseen 1:1 messages.
CREATE OR REPLACE FUNCTION public.get_direct_unread_by_user()
RETURNS TABLE(sender_id uuid, unread_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.sender_id, count(*)::int
  FROM public.proximity_messages m
  WHERE m.recipient_id = auth.uid()
    AND m.read_at IS NULL
  GROUP BY m.sender_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_direct_unread_by_user() TO authenticated;