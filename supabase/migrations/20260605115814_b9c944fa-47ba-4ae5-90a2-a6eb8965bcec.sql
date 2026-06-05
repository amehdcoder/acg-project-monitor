CREATE OR REPLACE FUNCTION public.can_access_microplanning(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner(_user_id)
      OR public.is_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.admin_page_access WHERE user_id = _user_id AND page_id = 'microplanning')
      OR EXISTS (SELECT 1 FROM public.microplan_form_access WHERE user_id = _user_id)
      OR public.has_field_designation(_user_id);
$$;

CREATE TABLE public.microplan_missing_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  state text NOT NULL,
  lga text NOT NULL,
  ward text NOT NULL,
  flhf_name text,
  community_name text NOT NULL,
  settlement_name text,
  source text NOT NULL DEFAULT 'grid3',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awaiting_capture','deleted_not_exist','deleted_duplicate','captured')),
  note text,
  flagged_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_missing_community
  ON public.microplan_missing_communities
  (COALESCE(project_id::text,''), lower(state), lower(lga), lower(ward), lower(community_name), lower(COALESCE(settlement_name,'')));

CREATE INDEX idx_missing_community_scope
  ON public.microplan_missing_communities (state, lga, ward, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microplan_missing_communities TO authenticated;
GRANT ALL ON public.microplan_missing_communities TO service_role;

ALTER TABLE public.microplan_missing_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Microplanning users view missing communities"
  ON public.microplan_missing_communities FOR SELECT TO authenticated
  USING (public.can_access_microplanning(auth.uid()));

CREATE POLICY "Microplanning users insert missing communities"
  ON public.microplan_missing_communities FOR INSERT TO authenticated
  WITH CHECK (public.can_access_microplanning(auth.uid()));

CREATE POLICY "Microplanning users update missing communities"
  ON public.microplan_missing_communities FOR UPDATE TO authenticated
  USING (public.can_access_microplanning(auth.uid()))
  WITH CHECK (public.can_access_microplanning(auth.uid()));

CREATE POLICY "Microplanning users delete missing communities"
  ON public.microplan_missing_communities FOR DELETE TO authenticated
  USING (public.can_access_microplanning(auth.uid()));

CREATE TRIGGER trg_missing_communities_updated_at
  BEFORE UPDATE ON public.microplan_missing_communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();