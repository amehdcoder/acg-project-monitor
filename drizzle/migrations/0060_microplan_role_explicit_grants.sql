REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.microplan_project_roles FROM authenticated;
REVOKE ALL ON public.microplan_project_roles FROM anon;
GRANT SELECT ON public.microplan_project_roles TO authenticated;
GRANT ALL ON public.microplan_project_roles TO service_role;