-- Fix function search paths for security
CREATE OR REPLACE FUNCTION public.create_default_chat_group()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_groups (project_id, name, description, created_by, is_default)
  VALUES (NEW.id, NEW.name || ' General', 'Default chat group for ' || NEW.name, NEW.created_by, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add chat_messages to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;