ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS pass_message text,
  ADD COLUMN IF NOT EXISTS fail_message text;