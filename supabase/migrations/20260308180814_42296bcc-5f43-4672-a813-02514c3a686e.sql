
-- Fix overly permissive INSERT policy
DROP POLICY "Service role can insert notifications" ON public.notifications;

-- Only allow insert for the user's own notifications or via service role (admin)
CREATE POLICY "Authenticated can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));
