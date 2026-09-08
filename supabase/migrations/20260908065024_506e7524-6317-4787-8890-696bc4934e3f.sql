DROP POLICY IF EXISTS "Users manage activities of their workplans" ON public.workplan_activities;
CREATE POLICY "Users manage activities of their workplans"
  ON public.workplan_activities FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workplans w
      WHERE w.id = workplan_activities.workplan_id
        AND w.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workplans w
      WHERE w.id = workplan_activities.workplan_id
        AND w.created_by = (SELECT auth.uid())
    )
  );