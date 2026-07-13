-- 1. ces_witness_logs: add controlled INSERT policy for authenticated submitters.
-- Restrict inserts to authenticated users who created the related survey.
CREATE POLICY "Submitters can insert witness logs for own surveys"
ON public.ces_witness_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ces_surveys s
    WHERE s.id = ces_witness_logs.survey_id
      AND s.created_by = auth.uid()
  )
);

-- 2. device_sessions: allow users to revoke (delete) their own sessions.
CREATE POLICY "Users can delete their own sessions"
ON public.device_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 3. forum_likes: stop exposing which user liked what to everyone.
-- Aggregate like counts are stored on forum_posts.likes_count, so scoping
-- visibility to the user's own likes does not break counts.
DROP POLICY IF EXISTS "Anyone authenticated can view likes" ON public.forum_likes;

CREATE POLICY "Users can view their own likes"
ON public.forum_likes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);