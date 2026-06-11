ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_seen_tour boolean NOT NULL DEFAULT false;