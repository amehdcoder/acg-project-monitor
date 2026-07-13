-- Performance: remove redundant duplicate indexes on form_submissions and add missing quiz_attempts index.
-- Redundant duplicates increase write amplification and memory use on every concurrent submission
-- without helping reads (an identical index already covers the same columns).

-- (form_id, created_at DESC) is covered 4x -- keep idx_form_submissions_form_created_at_desc, drop the rest.
DROP INDEX IF EXISTS public.idx_form_submissions_form_id;
DROP INDEX IF EXISTS public.idx_form_submissions_form_created;
DROP INDEX IF EXISTS public.idx_form_submissions_form_id_created_at;

-- (created_at DESC) is covered 2x -- keep idx_form_submissions_created_at_desc, drop the duplicate.
DROP INDEX IF EXISTS public.idx_form_submissions_created;

-- quiz_attempts.project_id is filtered by the project-scoped RLS/analytics but had no supporting index.
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_project ON public.quiz_attempts (project_id);

-- Refresh planner statistics on the touched tables.
ANALYZE public.form_submissions;
ANALYZE public.quiz_attempts;