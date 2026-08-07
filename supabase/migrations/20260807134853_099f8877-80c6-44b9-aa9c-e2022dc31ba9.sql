CREATE TABLE public.mda_lens_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  microplan_tabs text[] not null default '{}',
  supervisory_tabs text[] not null default '{}',
  states text[] not null default '{}',
  lgas text[] not null default '{}',
  can_export boolean not null default true,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mda_lens_grants TO authenticated;
GRANT ALL ON public.mda_lens_grants TO service_role;

ALTER TABLE public.mda_lens_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own MDA lens"
  ON public.mda_lens_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins insert MDA lens"
  ON public.mda_lens_grants FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins update MDA lens"
  ON public.mda_lens_grants FOR UPDATE TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins delete MDA lens"
  ON public.mda_lens_grants FOR DELETE TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE TRIGGER mda_lens_grants_updated_at BEFORE UPDATE ON public.mda_lens_grants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();