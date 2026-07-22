
-- 1. Project-level microplan access grants
CREATE TABLE public.microplan_project_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.microplan_project_grants TO authenticated;
GRANT ALL ON public.microplan_project_grants TO service_role;
ALTER TABLE public.microplan_project_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view microplan project grants"
  ON public.microplan_project_grants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Owner manages microplan project grants"
  ON public.microplan_project_grants FOR ALL
  TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Granted admins manage microplan project grants"
  ON public.microplan_project_grants FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_page_access
                 WHERE user_id = auth.uid() AND page_id = 'microplanning'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_page_access
                      WHERE user_id = auth.uid() AND page_id = 'microplanning'));

-- 2. Per-project exclusions (members explicitly removed by admin)
CREATE TABLE public.microplan_project_exclusions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  excluded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX idx_mpe_excl_user ON public.microplan_project_exclusions(user_id);
CREATE INDEX idx_mpe_excl_project ON public.microplan_project_exclusions(project_id);
GRANT SELECT ON public.microplan_project_exclusions TO authenticated;
GRANT ALL ON public.microplan_project_exclusions TO service_role;
ALTER TABLE public.microplan_project_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view microplan exclusions"
  ON public.microplan_project_exclusions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Owner manages microplan exclusions"
  ON public.microplan_project_exclusions FOR ALL
  TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Granted admins manage microplan exclusions"
  ON public.microplan_project_exclusions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_page_access
                 WHERE user_id = auth.uid() AND page_id = 'microplanning'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_page_access
                      WHERE user_id = auth.uid() AND page_id = 'microplanning'));

-- 3. Helper: can this user enter microplan data for this project + state?
CREATE OR REPLACE FUNCTION public.user_can_enter_microplan(_uid uuid, _project_id uuid, _state text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.microplan_project_grants g
    JOIN public.user_project_assignments upa
      ON upa.project_id = g.project_id AND upa.user_id = _uid
    JOIN public.projects p ON p.id = g.project_id
    WHERE g.project_id = _project_id
      AND NOT EXISTS (
        SELECT 1 FROM public.microplan_project_exclusions e
        WHERE e.project_id = g.project_id AND e.user_id = _uid
      )
      AND (
        COALESCE(array_length(p.scope_states, 1), 0) = 0
        OR _state = ANY(p.scope_states)
      )
  );
$$;

-- 4. Helper: does this user have microplan access via ANY project grant?
CREATE OR REPLACE FUNCTION public.user_has_microplan_project_access(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.microplan_project_grants g
    JOIN public.user_project_assignments upa
      ON upa.project_id = g.project_id AND upa.user_id = _uid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.microplan_project_exclusions e
      WHERE e.project_id = g.project_id AND e.user_id = _uid
    )
  );
$$;

-- 5. New RLS on microplan_entries for project-granted users
CREATE POLICY "Project-granted users can insert microplan entries"
  ON public.microplan_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_can_enter_microplan(auth.uid(), project_id, state)
  );

CREATE POLICY "Project-granted users can update own microplan entries"
  ON public.microplan_entries FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND public.user_can_enter_microplan(auth.uid(), project_id, state)
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_can_enter_microplan(auth.uid(), project_id, state)
  );

CREATE POLICY "Project-granted users can delete own microplan entries"
  ON public.microplan_entries FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND public.user_can_enter_microplan(auth.uid(), project_id, state)
  );
