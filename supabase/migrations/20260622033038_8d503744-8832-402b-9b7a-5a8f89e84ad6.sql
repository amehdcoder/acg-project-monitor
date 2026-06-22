CREATE TABLE public.user_minimal_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  restricted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_minimal_access TO authenticated;
GRANT ALL ON public.user_minimal_access TO service_role;

ALTER TABLE public.user_minimal_access ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read their own minimal-access flag (so the app can
-- enforce it client-side). Owner/Co-owner/admins can read all.
CREATE POLICY "Read own or admin minimal access"
  ON public.user_minimal_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- Only Owner, Co-owner or Super Admins manage the restriction.
CREATE POLICY "Admins manage minimal access"
  ON public.user_minimal_access FOR ALL
  TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.has_minimal_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_minimal_access WHERE user_id = _user_id
  ) AND NOT public.is_admin(_user_id);
$$;