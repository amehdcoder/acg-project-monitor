-- Learned model-routing statistics: one row per (question class, model tier).
CREATE TABLE public.ai_route_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_class TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('fast','balanced','deep')),
  model TEXT NOT NULL DEFAULT '',
  reward_sum NUMERIC NOT NULL DEFAULT 0,
  trials INTEGER NOT NULL DEFAULT 0,
  avg_reward NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_class, tier)
);
GRANT SELECT ON public.ai_route_stats TO authenticated;
GRANT ALL ON public.ai_route_stats TO service_role;
ALTER TABLE public.ai_route_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_route_stats_read" ON public.ai_route_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_route_stats_admin_write" ON public.ai_route_stats FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ai_route_reward(_class TEXT, _tier TEXT, _model TEXT, _reward NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_route_stats (question_class, tier, model, reward_sum, trials, avg_reward)
  VALUES (_class, _tier, COALESCE(_model,''), _reward, 1, _reward)
  ON CONFLICT (question_class, tier) DO UPDATE
    SET reward_sum = public.ai_route_stats.reward_sum + _reward,
        trials     = public.ai_route_stats.trials + 1,
        avg_reward = (public.ai_route_stats.reward_sum + _reward)
                     / GREATEST(public.ai_route_stats.trials + 1, 1),
        model      = COALESCE(NULLIF(_model,''), public.ai_route_stats.model),
        updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ai_route_reward(TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_route_reward(TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- Admin review queue: low-confidence or repeatedly downvoted answers.
CREATE TABLE public.ai_review_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.ai_chat_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.ai_chat_messages(id) ON DELETE SET NULL,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT 'low_confidence',
  severity SMALLINT NOT NULL DEFAULT 1,
  downvotes INTEGER NOT NULL DEFAULT 0,
  citations INTEGER NOT NULL DEFAULT 0,
  reward NUMERIC NOT NULL DEFAULT 0,
  question_class TEXT NOT NULL DEFAULT 'general',
  tier TEXT NOT NULL DEFAULT 'balanced',
  model TEXT NOT NULL DEFAULT '',
  policy_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  reviewer_id UUID,
  reviewer_correction TEXT,
  resolved_at TIMESTAMPTZ,
  submitted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ai_review_queue TO authenticated;
GRANT ALL ON public.ai_review_queue TO service_role;
ALTER TABLE public.ai_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_review_queue_admin_read" ON public.ai_review_queue FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "ai_review_queue_admin_update" ON public.ai_review_queue FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_ai_review_queue_pending ON public.ai_review_queue(status, severity DESC, created_at DESC);
