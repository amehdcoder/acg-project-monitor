DROP POLICY IF EXISTS "Seeclear grantees read monitoring records" ON public.seeclear_monitoring;
CREATE POLICY "Seeclear dashboard grantees read monitoring records"
  ON public.seeclear_monitoring FOR SELECT TO authenticated
  USING (public.has_standard_form((SELECT auth.uid()), 'seeclear_dash'));