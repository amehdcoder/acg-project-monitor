CREATE TABLE public.irf_form_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  form_category TEXT NOT NULL,
  grant_type TEXT NOT NULL CHECK (grant_type IN ('user','designation')),
  user_id UUID,
  designation TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT irf_form_access_target_chk CHECK (
    (grant_type = 'user' AND user_id IS NOT NULL) OR
    (grant_type = 'designation' AND designation IS NOT NULL)
  )
);

CREATE UNIQUE INDEX irf_form_access_user_uniq ON public.irf_form_access (form_category, COALESCE(project_id,'00000000-0000-0000-0000-000000000000'::uuid), user_id) WHERE grant_type = 'user';
CREATE UNIQUE INDEX irf_form_access_desig_uniq ON public.irf_form_access (form_category, COALESCE(project_id,'00000000-0000-0000-0000-000000000000'::uuid), designation) WHERE grant_type = 'designation';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.irf_form_access TO authenticated;
GRANT ALL ON public.irf_form_access TO service_role;

ALTER TABLE public.irf_form_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_irf_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'systems_admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND (is_owner = true OR is_co_owner = true)
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_irf_category(_project uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_irf_admin()
    OR EXISTS (
      SELECT 1 FROM public.irf_form_access a
      WHERE a.form_category = _category
        AND (a.project_id = _project OR a.project_id IS NULL OR _project IS NULL)
        AND (
          (a.grant_type = 'user' AND a.user_id = auth.uid())
          OR (a.grant_type = 'designation' AND a.designation = (
                SELECT p.designation::text FROM public.profiles p WHERE p.user_id = auth.uid()
             ))
        )
    )
$$;

CREATE POLICY "Authenticated can read irf form access"
ON public.irf_form_access FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage irf form access"
ON public.irf_form_access FOR ALL TO authenticated
USING (public.is_irf_admin())
WITH CHECK (public.is_irf_admin());