-- 1. Prevent actor spoofing on admin_surveillance_log inserts
DROP POLICY IF EXISTS "Admins can insert surveillance logs" ON public.admin_surveillance_log;
CREATE POLICY "Admins can insert surveillance logs"
ON public.admin_surveillance_log
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin((SELECT auth.uid()))
  AND actor_id = (SELECT auth.uid())
);

-- 2. Restrict seeclear_kobo_schema reads to admins / owner-level
DROP POLICY IF EXISTS "Signed-in users read seeclear schema" ON public.seeclear_kobo_schema;