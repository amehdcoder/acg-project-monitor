
-- Drop any prior SELECT policies that could hide webhook rows
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='microplan_entries' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.microplan_entries', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can view all microplan entries"
ON public.microplan_entries
FOR SELECT
TO authenticated
USING (true);
