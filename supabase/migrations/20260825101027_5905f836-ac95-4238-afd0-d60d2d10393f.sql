-- ============================================================
-- Amehnities AI: owner/team scoping + structured analysis notes
-- ============================================================

CREATE OR REPLACE FUNCTION public.ai_row_visible(_created_by uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _created_by = auth.uid()
      OR (_project_id IS NOT NULL AND public.is_project_member(auth.uid(), _project_id))
      OR public.is_admin(auth.uid())
      OR public.is_owner(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.ai_row_visible(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------- generated media
ALTER TABLE public.ai_generated_media
  ADD COLUMN IF NOT EXISTS project_id uuid;

DROP POLICY IF EXISTS "Read own generated media" ON public.ai_generated_media;
CREATE POLICY "Read own or team generated media"
  ON public.ai_generated_media FOR SELECT TO authenticated
  USING (public.ai_row_visible(created_by, project_id));

CREATE INDEX IF NOT EXISTS ai_generated_media_owner_idx
  ON public.ai_generated_media (created_by, created_at DESC);

-- ------------------------------------------------------- uploaded datasets
CREATE TABLE IF NOT EXISTS public.ai_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_type text,
  kind text NOT NULL DEFAULT 'table',
  row_count integer NOT NULL DEFAULT 0,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  conversation_id uuid,
  project_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_datasets TO authenticated;
GRANT ALL ON public.ai_datasets TO service_role;

ALTER TABLE public.ai_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or team datasets"
  ON public.ai_datasets FOR SELECT TO authenticated
  USING (public.ai_row_visible(created_by, project_id));

CREATE POLICY "Insert own datasets"
  ON public.ai_datasets FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own datasets"
  ON public.ai_datasets FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Delete own datasets"
  ON public.ai_datasets FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS ai_datasets_owner_idx ON public.ai_datasets (created_by, created_at DESC);

CREATE TRIGGER trg_ai_datasets_updated_at
  BEFORE UPDATE ON public.ai_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------- analysis notes
CREATE TABLE IF NOT EXISTS public.ai_analysis_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  question text,
  findings text NOT NULL,
  code text,
  stdout text,
  chart jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  dataset_id uuid REFERENCES public.ai_datasets(id) ON DELETE SET NULL,
  dataset_name text,
  conversation_id uuid,
  project_id uuid,
  scope_state text,
  scope_lga text,
  scope_ward text,
  scope_community text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_analysis_notes TO authenticated;
GRANT ALL ON public.ai_analysis_notes TO service_role;

ALTER TABLE public.ai_analysis_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or team analysis notes"
  ON public.ai_analysis_notes FOR SELECT TO authenticated
  USING (public.ai_row_visible(created_by, project_id));

CREATE POLICY "Insert own analysis notes"
  ON public.ai_analysis_notes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own analysis notes"
  ON public.ai_analysis_notes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Delete own analysis notes"
  ON public.ai_analysis_notes FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS ai_analysis_notes_owner_idx ON public.ai_analysis_notes (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_analysis_notes_scope_idx ON public.ai_analysis_notes (scope_state, scope_lga, scope_ward);
CREATE INDEX IF NOT EXISTS ai_analysis_notes_dataset_idx ON public.ai_analysis_notes (dataset_id);
CREATE INDEX IF NOT EXISTS ai_analysis_notes_search_idx
  ON public.ai_analysis_notes
  USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(findings,'') || ' ' || coalesce(question,'')));

CREATE TRIGGER trg_ai_analysis_notes_updated_at
  BEFORE UPDATE ON public.ai_analysis_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------- scope-safe memory retrieval
CREATE OR REPLACE FUNCTION public.match_ai_memory(
  _embedding extensions.vector(1536),
  _match_count integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.2,
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
  SELECT m.id, m.kind, m.title, m.content, m.metadata,
         1 - (m.embedding OPERATOR(extensions.<=>) _embedding) AS similarity
    FROM public.ai_memory_embeddings m
   WHERE m.embedding IS NOT NULL
     AND (_kinds IS NULL OR m.kind = ANY(_kinds))
     AND 1 - (m.embedding OPERATOR(extensions.<=>) _embedding) >= _min_similarity
     AND COALESCE(_user_id, auth.uid()) IS NOT NULL
     AND (
       m.created_by = COALESCE(_user_id, auth.uid())
       OR (m.is_shared AND m.project_id IS NULL)
       OR (m.project_id IS NOT NULL
           AND public.is_project_member(COALESCE(_user_id, auth.uid()), m.project_id))
       OR public.is_admin(COALESCE(_user_id, auth.uid()))
       OR public.is_owner(COALESCE(_user_id, auth.uid()))
     )
   ORDER BY m.embedding OPERATOR(extensions.<=>) _embedding
   LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;

GRANT EXECUTE ON FUNCTION public.match_ai_memory(extensions.vector, integer, double precision, text[], uuid) TO authenticated, service_role;