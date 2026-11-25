DROP POLICY IF EXISTS "Authenticated can record movements" ON public.stock_movements;
CREATE POLICY "Facility staff can record movements" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = performed_by AND (
      public.is_admin(auth.uid())
      OR (movement_type = 'dispense' AND public.can_record_at_facility(auth.uid(), facility_id))
      OR public.can_manage_at_facility(auth.uid(), facility_id)
      OR EXISTS (SELECT 1 FROM public.stock_approver_assignments a WHERE a.facility_id = stock_movements.facility_id AND a.approver_user_id = auth.uid())
    )
    AND EXISTS (SELECT 1 FROM public.antidepressant_stock s WHERE s.id = stock_movements.stock_id AND s.facility_id = stock_movements.facility_id)
  );
REVOKE EXECUTE ON FUNCTION public.ai_route_reward(text,text,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_route_reward(text,text,text,numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ai_policy_reward(uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_policy_reward(uuid,numeric) TO service_role;