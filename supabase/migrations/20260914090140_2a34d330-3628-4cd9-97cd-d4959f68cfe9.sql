DROP POLICY IF EXISTS "Admins manage safeguarding officers" ON public.safeguarding_officers;

CREATE POLICY "Admins manage safeguarding officers"
  ON public.safeguarding_officers FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    AND (
      user_id <> (SELECT auth.uid())
      OR public.is_owner((SELECT auth.uid()))
    )
  );