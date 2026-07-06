CREATE INDEX IF NOT EXISTS idx_forms_project_created ON public.forms (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_created_desc ON public.forms (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sarmaan_form_access_user_form ON public.sarmaan_form_access (user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_sarmaan_form_access_project_user ON public.sarmaan_form_access (project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_user_group ON public.chat_group_members (user_id, chat_group_id);
CREATE INDEX IF NOT EXISTS idx_mda_tile_icons_form_id ON public.mda_tile_icons (form_id);
CREATE INDEX IF NOT EXISTS idx_proximity_presence_active_recent ON public.proximity_presence (enabled, updated_at DESC, user_id) WHERE enabled = true;