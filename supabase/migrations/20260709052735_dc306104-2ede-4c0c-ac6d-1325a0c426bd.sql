ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS pre_pass_message  text,
  ADD COLUMN IF NOT EXISTS pre_fail_message  text,
  ADD COLUMN IF NOT EXISTS post_pass_message text,
  ADD COLUMN IF NOT EXISTS post_fail_message text;