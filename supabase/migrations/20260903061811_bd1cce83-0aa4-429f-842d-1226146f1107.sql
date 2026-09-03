ALTER TABLE public.ai_memory_embeddings ALTER COLUMN is_shared SET DEFAULT false;

DROP POLICY IF EXISTS "Read shared or own AI memory" ON public.ai_memory_embeddings;

CREATE POLICY "Read scoped shared or own AI memory"
ON public.ai_memory_embeddings
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
  OR public.is_owner((SELECT auth.uid()))
  OR (
    is_shared
    AND project_id IS NOT NULL
    AND public.is_project_member((SELECT auth.uid()), project_id)
  )
);