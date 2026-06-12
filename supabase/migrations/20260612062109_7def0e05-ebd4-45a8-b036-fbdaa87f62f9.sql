ALTER TABLE public.chat_groups
  ADD COLUMN IF NOT EXISTS icon_url text;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS transcription text;