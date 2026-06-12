-- =========================================================
-- Web Push: subscriptions table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Triggers that fan out push notifications via pg_net
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_chat_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_deleted, false) = true THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://vhuixgcjmrmfowzrulac.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWl4Z2NqbXJtZm93enJ1bGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDEyNzksImV4cCI6MjA4Mjc3NzI3OX0.mKN7lvoLNdh7zZD8-m2O4qoUZ71tBmnXRzFR6fN0Uf0'
    ),
    body := jsonb_build_object('type', 'group', 'message_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_message_push ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_message_push
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message_push();

CREATE OR REPLACE FUNCTION public.notify_proximity_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://vhuixgcjmrmfowzrulac.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWl4Z2NqbXJtZm93enJ1bGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDEyNzksImV4cCI6MjA4Mjc3NzI3OX0.mKN7lvoLNdh7zZD8-m2O4qoUZ71tBmnXRzFR6fN0Uf0'
    ),
    body := jsonb_build_object('type', 'direct', 'message_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_proximity_message_push ON public.proximity_messages;
CREATE TRIGGER trg_notify_proximity_message_push
  AFTER INSERT ON public.proximity_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_proximity_message_push();