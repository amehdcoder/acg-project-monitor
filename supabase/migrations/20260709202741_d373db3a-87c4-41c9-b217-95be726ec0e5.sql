-- Restore Data API access for the tables used by project/form loading.
-- These grants do not bypass row-level security; policies still decide which rows a user can see.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_project_assignments TO authenticated;
GRANT ALL ON public.user_project_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_form_assignments TO authenticated;
GRANT ALL ON public.user_form_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_members TO authenticated;
GRANT ALL ON public.chat_group_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_page_access TO authenticated;
GRANT ALL ON public.user_page_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_page_access TO authenticated;
GRANT ALL ON public.admin_page_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_minimal_access TO authenticated;
GRANT ALL ON public.user_minimal_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_form_access TO authenticated;
GRANT ALL ON public.microplan_form_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standard_form_user_restrictions TO authenticated;
GRANT ALL ON public.standard_form_user_restrictions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_standard_form_assignments TO authenticated;
GRANT ALL ON public.user_standard_form_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standard_form_disabled TO authenticated;
GRANT ALL ON public.standard_form_disabled TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mda_checklist_copy_hidden TO authenticated;
GRANT ALL ON public.mda_checklist_copy_hidden TO service_role;

-- The Forms page project dropdown is a project catalog. Make project rows visible
-- to signed-in users so the dropdown can always render the full list immediately.
DROP POLICY IF EXISTS "Authenticated users can view project catalog" ON public.projects;
CREATE POLICY "Authenticated users can view project catalog"
ON public.projects
FOR SELECT
TO authenticated
USING (true);

-- Keep project/form access checks and dropdown ordering fast under concurrent use.
CREATE INDEX IF NOT EXISTS idx_projects_name_active ON public.projects (name) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc ON public.projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_project_id_name ON public.forms (project_id, name);
CREATE INDEX IF NOT EXISTS idx_forms_project_id_created_at ON public.forms (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_user_project ON public.user_project_assignments (user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_project_user ON public.user_project_assignments (project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_form_assignments_user_form ON public.user_form_assignments (user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_user_group ON public.chat_group_members (user_id, chat_group_id);