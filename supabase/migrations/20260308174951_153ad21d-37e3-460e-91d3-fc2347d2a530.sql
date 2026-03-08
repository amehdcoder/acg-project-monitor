ALTER TABLE public.form_submissions ADD COLUMN submission_type text NOT NULL DEFAULT 'regular';

COMMENT ON COLUMN public.form_submissions.submission_type IS 'Type of submission: regular, registration, or follow_up';