CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.ai_memory_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  source_id text,
  title text,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id uuid,
  created_by uuid,
  is_shared boolean NOT NULL DEFAULT true,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory_embeddings TO authenticated;
GRANT ALL ON public.ai_memory_embeddings TO service_role;

ALTER TABLE public.ai_memory_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read shared or own AI memory"
  ON public.ai_memory_embeddings FOR SELECT TO authenticated
  USING (is_shared OR created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Insert own AI memory"
  ON public.ai_memory_embeddings FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Update own AI memory"
  ON public.ai_memory_embeddings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Delete own AI memory"
  ON public.ai_memory_embeddings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE INDEX ai_memory_embeddings_kind_idx ON public.ai_memory_embeddings (kind, created_at DESC);
CREATE INDEX ai_memory_embeddings_source_idx ON public.ai_memory_embeddings (source_id);
CREATE INDEX ai_memory_embeddings_vec_idx
  ON public.ai_memory_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

CREATE TRIGGER trg_ai_memory_embeddings_updated_at
  BEFORE UPDATE ON public.ai_memory_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_generated_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'image',
  prompt text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'completed',
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_generated_media TO authenticated;
GRANT ALL ON public.ai_generated_media TO service_role;

ALTER TABLE public.ai_generated_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own generated media"
  ON public.ai_generated_media FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

CREATE POLICY "Insert own generated media"
  ON public.ai_generated_media FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own generated media"
  ON public.ai_generated_media FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Delete own generated media"
  ON public.ai_generated_media FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_ai_generated_media_updated_at
  BEFORE UPDATE ON public.ai_generated_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.match_ai_memory(
  _embedding extensions.vector(1536),
  _match_count integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.2,
  _kinds text[] DEFAULT NULL
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
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT m.id, m.kind, m.title, m.content, m.metadata,
         1 - (m.embedding OPERATOR(extensions.<=>) _embedding) AS similarity
    FROM public.ai_memory_embeddings m
   WHERE m.embedding IS NOT NULL
     AND (_kinds IS NULL OR m.kind = ANY(_kinds))
     AND 1 - (m.embedding OPERATOR(extensions.<=>) _embedding) >= _min_similarity
   ORDER BY m.embedding OPERATOR(extensions.<=>) _embedding
   LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;