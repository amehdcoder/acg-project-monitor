CREATE TABLE IF NOT EXISTS public.sarmaan_form_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id uuid NOT NULL,
  section_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, section_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sarmaan_form_access TO authenticated;
GRANT ALL ON public.sarmaan_form_access TO service_role;

ALTER TABLE public.sarmaan_form_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see own sarmaan form access"
ON public.sarmaan_form_access FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers grant sarmaan form access"
ON public.sarmaan_form_access FOR INSERT TO authenticated
WITH CHECK (public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers update sarmaan form access"
ON public.sarmaan_form_access FOR UPDATE TO authenticated
USING (public.can_manage_dashboards(auth.uid()))
WITH CHECK (public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers remove sarmaan form access"
ON public.sarmaan_form_access FOR DELETE TO authenticated
USING (public.can_manage_dashboards(auth.uid()));