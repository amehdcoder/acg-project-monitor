CREATE TABLE IF NOT EXISTS public.bmz_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bmz_project_assignments TO authenticated;
GRANT ALL ON public.bmz_project_assignments TO service_role;

ALTER TABLE public.bmz_project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bmz_assignments_select" ON public.bmz_project_assignments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bmz_assignments_insert" ON public.bmz_project_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'systems_admin') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_owner = true)
  );

CREATE POLICY "bmz_assignments_delete" ON public.bmz_project_assignments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'systems_admin') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_owner = true)
  );