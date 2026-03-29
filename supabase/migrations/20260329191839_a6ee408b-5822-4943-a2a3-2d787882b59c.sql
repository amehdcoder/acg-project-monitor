
-- Quiz tables
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  post_test_delay_days INTEGER NOT NULL DEFAULT 7,
  time_limit_minutes INTEGER,
  passing_score NUMERIC(5,2) DEFAULT 50,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'select_one',
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  points NUMERIC(5,2) DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  attempt_type TEXT NOT NULL DEFAULT 'pre_test',
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX idx_quiz_attempts_quiz ON public.quiz_attempts(quiz_id);
CREATE INDEX idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE UNIQUE INDEX idx_quiz_attempts_unique ON public.quiz_attempts(quiz_id, user_id, attempt_type);

-- RLS
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Quizzes: admins manage, authenticated read published
CREATE POLICY "Admins manage quizzes" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view published quizzes" ON public.quizzes
  FOR SELECT TO authenticated
  USING (is_published = true);

-- Quiz questions: admins manage, authenticated read
CREATE POLICY "Admins manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view quiz questions" ON public.quiz_questions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE id = quiz_id AND is_published = true));

-- Quiz attempts: users manage own
CREATE POLICY "Users manage own attempts" ON public.quiz_attempts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
