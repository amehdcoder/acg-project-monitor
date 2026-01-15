-- Remove the trigger and function that auto-creates default chat groups
DROP TRIGGER IF EXISTS on_project_created_create_chat_group ON public.projects;
DROP FUNCTION IF EXISTS public.create_default_chat_group();

-- Delete existing default chat groups that have no messages
DELETE FROM public.chat_groups 
WHERE is_default = true 
AND id NOT IN (
  SELECT DISTINCT chat_group_id FROM public.chat_messages
);