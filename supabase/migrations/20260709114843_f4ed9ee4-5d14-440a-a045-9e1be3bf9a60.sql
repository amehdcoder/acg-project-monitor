-- Restore Data API grants on access-control tables so the app can read them.
-- These tables had no privileges granted to authenticated, so every client
-- query silently failed with permission denied — meaning per-user page grants
-- (e.g. Quizzes access) were never visible to the app.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_page_access TO authenticated;
GRANT ALL ON public.user_page_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_page_access TO authenticated;
GRANT ALL ON public.admin_page_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_minimal_access TO authenticated;
GRANT ALL ON public.user_minimal_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_form_access TO authenticated;
GRANT ALL ON public.microplan_form_access TO service_role;