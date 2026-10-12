GRANT DELETE ON public.safeguarding_concerns TO authenticated;
DROP POLICY IF EXISTS "Owner or super admin delete safeguarding concerns" ON public.safeguarding_concerns;
CREATE POLICY "Owner or super admin delete safeguarding concerns" ON public.safeguarding_concerns
  FOR DELETE TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));