CREATE OR REPLACE FUNCTION public.match_ai_memory(
  _embedding extensions.vector,
  _match_count integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.0,
  _kinds text[] DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  kind text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH viewer AS (
    SELECT CASE
             WHEN auth.uid() IS NOT NULL THEN auth.uid()
             ELSE _user_id
           END AS uid
  )
  SELECT m.id, m.kind, m.title, m.content, m.metadata,
         1 - (m.embedding OPERATOR(extensions.<=>) _embedding) AS similarity
    FROM public.ai_memory_embeddings m, viewer v
   WHERE m.embedding IS NOT NULL
     AND (_kinds IS NULL OR m.kind = ANY(_kinds))
     AND 1 - (m.embedding OPERATOR(extensions.<=>) _embedding) >= _min_similarity
     AND v.uid IS NOT NULL
     AND (
       m.created_by = v.uid
       OR public.is_admin(v.uid)
       OR public.is_owner(v.uid)
       OR (m.is_shared AND m.project_id IS NOT NULL
           AND public.is_project_member(v.uid, m.project_id))
     )
   ORDER BY m.embedding OPERATOR(extensions.<=>) _embedding
   LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;