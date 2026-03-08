
CREATE TABLE public.active_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  started_by uuid NOT NULL,
  call_type text NOT NULL DEFAULT 'voice',
  room_name text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.active_calls ENABLE ROW LEVEL SECURITY;

-- Members of the chat group can view active calls
CREATE POLICY "Members can view active calls"
  ON public.active_calls
  FOR SELECT
  TO authenticated
  USING (public.is_chat_group_member(auth.uid(), chat_group_id) OR public.is_admin(auth.uid()));

-- Authenticated users can start calls in their groups
CREATE POLICY "Members can start calls"
  ON public.active_calls
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chat_group_member(auth.uid(), chat_group_id) AND auth.uid() = started_by);

-- Call starter or admin can update (end) calls
CREATE POLICY "Starter or admin can update calls"
  ON public.active_calls
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = started_by OR public.is_admin(auth.uid()));

-- Call starter or admin can delete calls
CREATE POLICY "Starter or admin can delete calls"
  ON public.active_calls
  FOR DELETE
  TO authenticated
  USING (auth.uid() = started_by OR public.is_admin(auth.uid()));

-- Enable realtime for active_calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;
