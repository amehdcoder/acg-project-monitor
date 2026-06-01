-- Custom banks (intentionally NOT included in owner_factory_reset, so it persists permanently)
CREATE TABLE public.custom_banks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  code text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.custom_banks TO anon, authenticated;
GRANT INSERT ON public.custom_banks TO authenticated;
GRANT ALL ON public.custom_banks TO service_role;

ALTER TABLE public.custom_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view custom banks"
ON public.custom_banks FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can add custom banks"
ON public.custom_banks FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can delete custom banks"
ON public.custom_banks FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- Bulk data permissions (owner grants export/import to specific admins)
CREATE TABLE public.form_bulk_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  can_export boolean NOT NULL DEFAULT true,
  can_import boolean NOT NULL DEFAULT true,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_bulk_permissions TO authenticated;
GRANT ALL ON public.form_bulk_permissions TO service_role;

ALTER TABLE public.form_bulk_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages bulk permissions"
ON public.form_bulk_permissions FOR ALL TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Users can view their own bulk permission"
ON public.form_bulk_permissions FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_owner(auth.uid()));

-- Helper: can a user export/import bulk data?
CREATE OR REPLACE FUNCTION public.can_bulk_data(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner(_user_id)
    OR (
      public.is_admin(_user_id) AND EXISTS (
        SELECT 1 FROM public.form_bulk_permissions p
        WHERE p.user_id = _user_id
          AND ((_action = 'export' AND p.can_export) OR (_action = 'import' AND p.can_import))
      )
    );
$$;