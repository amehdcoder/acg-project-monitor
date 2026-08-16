
CREATE OR REPLACE FUNCTION public.shares_project_with(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_project_assignments a
    JOIN public.user_project_assignments b ON b.project_id = a.project_id
    WHERE a.user_id = _a AND b.user_id = _b
  )
$$;

DROP POLICY IF EXISTS "Participants read enabled proximity presence" ON public.proximity_presence;

CREATE POLICY "Participants read enabled proximity presence"
ON public.proximity_presence
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    enabled = true
    AND is_proximity_participant(auth.uid())
    AND public.shares_project_with(auth.uid(), user_id)
  )
);
