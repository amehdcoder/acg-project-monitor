CREATE INDEX IF NOT EXISTS idx_bloomberg_schools_school_name ON public.bloomberg_schools (school_name);
CREATE INDEX IF NOT EXISTS idx_bloomberg_schools_state_lga ON public.bloomberg_schools (state, lga);
CREATE INDEX IF NOT EXISTS idx_user_cascade_assignments_user_form ON public.user_cascade_assignments (user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_school_key ON public.bloomberg_validations (school_key);
CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_created_at ON public.bloomberg_validations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON public.form_submissions (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON public.form_submissions (user_id);