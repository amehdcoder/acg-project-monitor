-- Human feedback signals on assistant answers (the reward channel).
CREATE TABLE public.ai_chat_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.ai_chat_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_chat_messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  rating SMALLINT NOT NULL DEFAULT 0,
  correction TEXT,
  reward NUMERIC NOT NULL DEFAULT 0,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_feedback TO authenticated;
GRANT ALL ON public.ai_chat_feedback TO service_role;
ALTER TABLE public.ai_chat_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ai_feedback" ON public.ai_chat_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_ai_chat_feedback_msg ON public.ai_chat_feedback(message_id);
CREATE INDEX idx_ai_chat_feedback_user ON public.ai_chat_feedback(user_id, created_at DESC);

-- Learned policy: distilled behaviour rules and high-reward exemplars.
CREATE TABLE public.ai_chat_policy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'rule' CHECK (kind IN ('rule','exemplar')),
  topic TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  question TEXT,
  answer TEXT,
  reward_sum NUMERIC NOT NULL DEFAULT 0,
  trials INTEGER NOT NULL DEFAULT 0,
  avg_reward NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_chat_policy TO authenticated;
GRANT ALL ON public.ai_chat_policy TO service_role;
ALTER TABLE public.ai_chat_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_policy_read" ON public.ai_chat_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_policy_admin_write" ON public.ai_chat_policy FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_ai_chat_policy_rank ON public.ai_chat_policy(active, kind, avg_reward DESC);

CREATE TRIGGER trg_ai_chat_policy_updated_at
  BEFORE UPDATE ON public.ai_chat_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bandit update: fold a new reward into a policy entry's running statistics.
CREATE OR REPLACE FUNCTION public.ai_policy_reward(_policy_id UUID, _reward NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_chat_policy
     SET trials = trials + 1,
         reward_sum = reward_sum + _reward,
         avg_reward = (reward_sum + _reward) / GREATEST(trials + 1, 1),
         active = CASE WHEN (reward_sum + _reward) / GREATEST(trials + 1, 1) < -0.5
                        AND trials + 1 >= 4 THEN false ELSE active END
   WHERE id = _policy_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ai_policy_reward(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_policy_reward(UUID, NUMERIC) TO service_role;