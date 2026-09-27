CREATE TABLE public.microplan_workspace_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX microplan_workspace_locks_uniq
  ON public.microplan_workspace_locks (project_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, DELETE ON public.microplan_workspace_locks TO authenticated;
GRANT ALL ON public.microplan_workspace_locks TO service_role;
ALTER TABLE public.microplan_workspace_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or project-wide geo locks" ON public.microplan_workspace_locks
FOR SELECT TO authenticated
USING (user_id IS NULL OR user_id = auth.uid()
  OR public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners and super admins add geo locks" ON public.microplan_workspace_locks
FOR INSERT TO authenticated
WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners and super admins remove geo locks" ON public.microplan_workspace_locks
FOR DELETE TO authenticated
USING (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));