CREATE TABLE public.mda_checklist_copy_hidden (
  project_id UUID NOT NULL PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  hidden BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mda_checklist_copy_hidden TO authenticated;
GRANT ALL ON public.mda_checklist_copy_hidden TO service_role;
ALTER TABLE public.mda_checklist_copy_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read copy-hidden flags"
  ON public.mda_checklist_copy_hidden FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners manage copy-hidden flags"
  ON public.mda_checklist_copy_hidden FOR ALL TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));