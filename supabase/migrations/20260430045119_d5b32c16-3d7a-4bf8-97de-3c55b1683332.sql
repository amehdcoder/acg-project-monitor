
ALTER TABLE public.microplan_allocation_history
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

DROP POLICY IF EXISTS "Admins delete allocation history" ON public.microplan_allocation_history;
CREATE POLICY "Admins delete allocation history"
  ON public.microplan_allocation_history
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update allocation history" ON public.microplan_allocation_history;
CREATE POLICY "Admins update allocation history"
  ON public.microplan_allocation_history
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
