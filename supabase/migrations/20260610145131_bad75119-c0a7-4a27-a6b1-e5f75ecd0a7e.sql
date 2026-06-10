-- 1) Delivery receipts for proximity chat
ALTER TABLE public.proximity_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 2) Auto-grant project chat membership to assigned users
CREATE OR REPLACE FUNCTION public.sync_project_assignment_chat_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT cg.id, NEW.user_id, 'member', COALESCE(NEW.assigned_by, NEW.user_id)
  FROM public.chat_groups cg
  WHERE cg.project_id = NEW.project_id
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_assignment_chat ON public.user_project_assignments;
CREATE TRIGGER trg_project_assignment_chat
AFTER INSERT ON public.user_project_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_project_assignment_chat_membership();

-- 3) When a new chat group is created, add all currently-assigned project users
CREATE OR REPLACE FUNCTION public.sync_new_chat_group_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_group_members (chat_group_id, user_id, role, added_by)
  SELECT NEW.id, upa.user_id, 'member', NEW.created_by
  FROM public.user_project_assignments upa
  WHERE upa.project_id = NEW.project_id
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_chat_group_members ON public.chat_groups;
CREATE TRIGGER trg_new_chat_group_members
AFTER INSERT ON public.chat_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_new_chat_group_members();

-- 4) Remove chat membership when a project assignment is revoked (keep admins)
CREATE OR REPLACE FUNCTION public.sync_remove_project_assignment_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_group_members m
  USING public.chat_groups cg
  WHERE m.chat_group_id = cg.id
    AND cg.project_id = OLD.project_id
    AND m.user_id = OLD.user_id
    AND m.role <> 'admin';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_project_assignment_chat ON public.user_project_assignments;
CREATE TRIGGER trg_remove_project_assignment_chat
AFTER DELETE ON public.user_project_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_remove_project_assignment_chat();