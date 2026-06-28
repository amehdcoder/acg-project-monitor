ALTER TABLE public.client_error_logs
  DROP CONSTRAINT IF EXISTS client_error_logs_user_id_fkey;

DROP POLICY IF EXISTS "Users can log client errors" ON public.client_error_logs;
CREATE POLICY "Users can log client errors"
  ON public.client_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMENT ON COLUMN public.client_error_logs.user_id IS 'Authenticated application user id captured at the time the client-side error was logged.';