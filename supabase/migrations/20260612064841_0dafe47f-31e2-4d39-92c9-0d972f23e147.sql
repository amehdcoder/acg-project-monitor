-- 1. Protection flag for special groups
ALTER TABLE public.chat_groups
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

-- 2. Capture Google profile picture into avatar_url on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_owner_user BOOLEAN := false;
  v_first_name TEXT;
  v_last_name TEXT;
  v_full_name TEXT;
  v_approval TEXT := 'pending';
  v_designation_text TEXT;
  v_designation user_designation := 'data_collector';
  v_avatar TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.deleted_account_emails
    WHERE lower(email) = lower(NEW.email)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.email = 'amehjoey1@gmail.com' THEN
    is_owner_user := true;
    v_approval := 'approved';
  END IF;

  v_first_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'given_name'), ''),
    NULL
  );
  v_last_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'family_name'), ''),
    NULL
  );

  IF v_first_name IS NULL THEN
    v_full_name := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      ''
    );
    IF v_full_name != '' THEN
      v_first_name := SPLIT_PART(v_full_name, ' ', 1);
      v_last_name := COALESCE(NULLIF(TRIM(SUBSTRING(v_full_name FROM POSITION(' ' IN v_full_name) + 1)), ''), v_last_name);
    END IF;
  END IF;

  v_first_name := COALESCE(v_first_name, '');
  v_last_name := COALESCE(v_last_name, '');

  v_designation_text := NULLIF(TRIM(NEW.raw_user_meta_data->>'designation'), '');
  IF v_designation_text IS NOT NULL THEN
    BEGIN
      v_designation := v_designation_text::user_designation;
    EXCEPTION WHEN others THEN
      v_designation := 'data_collector';
    END;
  END IF;

  -- Google (and other OAuth) providers store the photo under picture / avatar_url
  v_avatar := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'picture'), ''),
    NULL
  );

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, is_owner, approval_status,
    designation, other_designation, phone_number, alternate_phone,
    alternate_email, state, lga, ward, avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_first_name,
    v_last_name,
    is_owner_user,
    v_approval,
    v_designation,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'other_designation'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'alternate_phone'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'alternate_email'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'state'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'lga'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'ward'), ''),
    v_avatar
  );

  IF is_owner_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, category)
  SELECT ur.user_id,
         '🆕 New User Registration',
         v_first_name || ' ' || v_last_name || ' (' || NEW.email || ') has registered and is pending approval.',
         'warning',
         'registration'
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin';

  RETURN NEW;
END;
$function$;

-- 3. List project members (for starting direct chats), bypassing profile RLS safely
CREATE OR REPLACE FUNCTION public.get_project_chat_members(_project_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text, designation text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    p.user_id,
    COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), p.email, 'User') AS full_name,
    p.email,
    p.avatar_url,
    p.designation::text
  FROM public.user_project_assignments upa
  JOIN public.profiles p ON p.user_id = upa.user_id
  WHERE upa.project_id = _project_id
    AND p.user_id <> auth.uid()
    AND COALESCE(p.is_active, true) = true
    AND (
      EXISTS (SELECT 1 FROM public.user_project_assignments me WHERE me.project_id = _project_id AND me.user_id = auth.uid())
      OR public.is_admin(auth.uid())
      OR public.is_owner(auth.uid())
    )
  ORDER BY full_name;
$function$;

-- 4. Ensure the HANDS Staff - Official group exists for a project and is synced
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

  -- Only members of the project (or admins/owner) may trigger creation/sync.
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

  -- Sync all HANDS staff assigned to this project into the group.
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT v_group_id, p.user_id, 'member', v_me
  FROM public.user_project_assignments upa
  JOIN public.profiles p ON p.user_id = upa.user_id
  WHERE upa.project_id = _project_id
    AND p.designation = 'hands_staff'
    AND COALESCE(p.is_active, true) = true
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$function$;

-- 5. Prevent deletion of protected groups unless performed by the Owner
CREATE OR REPLACE FUNCTION public.guard_protected_chat_group_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_protected = true AND NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'This official group can only be deleted by the Owner.';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_protected_chat_group_delete ON public.chat_groups;
CREATE TRIGGER trg_guard_protected_chat_group_delete
  BEFORE DELETE ON public.chat_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_chat_group_delete();

-- 6. Show direct conversations even before the first message is sent
CREATE OR REPLACE FUNCTION public.get_proximity_conversations()
 RETURNS TABLE(conversation_id uuid, other_id uuid, other_name text, status text, archived boolean, last_message text, last_message_at timestamp with time zone, last_sender_id uuid, unread_count integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END AS other_id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''),
      p.email,
      pr.display_name,
      'User'
    ) AS other_name,
    c.status,
    CASE WHEN c.user_a = auth.uid() THEN c.archived_by_a ELSE c.archived_by_b END AS archived,
    lm.body,
    lm.created_at,
    lm.sender_id,
    COALESCE(uc.cnt, 0)::int,
    c.updated_at
  FROM public.proximity_conversations c
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
    FROM public.proximity_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.proximity_messages m
    WHERE m.conversation_id = c.id
      AND m.recipient_id = auth.uid()
      AND m.read_at IS NULL
  ) uc ON true
  LEFT JOIN public.profiles p
    ON p.user_id = (CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END)
  LEFT JOIN public.proximity_presence pr
    ON pr.user_id = (CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END)
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND NOT (CASE WHEN c.user_a = auth.uid() THEN c.deleted_by_a ELSE c.deleted_by_b END)
  ORDER BY COALESCE(lm.created_at, c.updated_at) DESC;
$function$;