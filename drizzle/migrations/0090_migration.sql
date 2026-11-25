DROP TRIGGER IF EXISTS trg_notify_owner_form_submission ON public.form_submissions;
CREATE TABLE IF NOT EXISTS public.form_submission_daily_digests (
  owner_id uuid NOT NULL,
  digest_date date NOT NULL,
  recipient text,
  submission_count int,
  status text NOT NULL DEFAULT 'claimed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, digest_date)
);
ALTER TABLE public.form_submission_daily_digests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_submission_daily_digests FROM anon, authenticated;
GRANT ALL ON public.form_submission_daily_digests TO service_role;