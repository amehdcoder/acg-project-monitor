
DROP POLICY IF EXISTS "Relay can insert their own transfers" ON public.mesh_sync_transfers;
CREATE POLICY "Approved relays can insert their own transfers"
ON public.mesh_sync_transfers
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = relay_user_id
  AND EXISTS (
    SELECT 1 FROM public.mesh_sync_relays r
    WHERE r.user_id = auth.uid() AND r.enabled = true
  )
);

DROP POLICY IF EXISTS "Read stock movements" ON public.stock_movements;
CREATE POLICY "Read stock movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (
  performed_by = auth.uid()
  OR is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.stock_approver_assignments a
    WHERE a.facility_id = stock_movements.facility_id
      AND a.approver_user_id = auth.uid()
  )
);
