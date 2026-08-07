CREATE OR REPLACE FUNCTION public.has_active_mda_lens(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mda_lens_grants g
    WHERE g.user_id = _user_id
      AND g.enabled = true
  )
$$;

CREATE OR REPLACE FUNCTION public.mda_lens_allows_project(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mda_lens_grants g
    WHERE g.user_id = _user_id
      AND g.enabled = true
      AND (
        COALESCE(cardinality(g.project_ids), 0) = 0
        OR _project_id = ANY(g.project_ids)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.mda_lens_allows_row(
  _user_id uuid,
  _project_id uuid,
  _state text,
  _lga text,
  _ward text,
  _campaign_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mda_lens_grants g
    WHERE g.user_id = _user_id
      AND g.enabled = true
      AND (
        COALESCE(cardinality(g.project_ids), 0) = 0
        OR _project_id = ANY(g.project_ids)
      )
      AND (
        COALESCE(cardinality(g.states), 0) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(g.states) allowed(value)
          WHERE lower(btrim(allowed.value)) = lower(btrim(COALESCE(_state, '')))
        )
      )
      AND (
        COALESCE(cardinality(g.lgas), 0) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(g.lgas) allowed(value)
          WHERE lower(btrim(allowed.value)) = lower(btrim(COALESCE(_lga, '')))
        )
      )
      AND (
        COALESCE(cardinality(g.wards), 0) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(g.wards) allowed(value)
          WHERE lower(btrim(allowed.value)) = lower(btrim(COALESCE(_ward, '')))
        )
      )
      AND (
        COALESCE(cardinality(g.campaign_types), 0) = 0
        OR NULLIF(btrim(COALESCE(_campaign_type, '')), '') IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(g.campaign_types) allowed(value)
          WHERE lower(btrim(allowed.value)) = lower(btrim(_campaign_type))
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.has_active_mda_lens(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mda_lens_allows_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mda_lens_allows_row(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_mda_lens(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mda_lens_allows_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mda_lens_allows_row(uuid, uuid, text, text, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Assigned users can view projects" ON public.projects;
DROP POLICY IF EXISTS "Microplan form access users can view projects" ON public.projects;
CREATE POLICY "Scoped project visibility including MDA Lens"
ON public.projects
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_project(auth.uid(), id)
  )
  OR (
    NOT public.has_active_mda_lens(auth.uid())
    AND (
      id = ANY(public.accessible_project_ids(auth.uid()))
      OR public.has_microplan_form_access(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Scoped read of microplan entries" ON public.microplan_entries;
CREATE POLICY "Scoped read of microplan entries"
ON public.microplan_entries
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_row(auth.uid(), project_id, state, lga, ward, campaign_type)
  )
  OR (
    NOT public.has_active_mda_lens(auth.uid())
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_project_assignments upa
        WHERE upa.user_id = auth.uid() AND upa.project_id = microplan_entries.project_id
      )
      OR EXISTS (
        SELECT 1 FROM public.microplan_form_access mfa
        WHERE mfa.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.admin_page_access apa
        WHERE apa.user_id = auth.uid() AND apa.page_id = 'microplanning'
      )
    )
  )
);

DROP POLICY IF EXISTS "Admins and creators read medicine allocations" ON public.microplan_medicine_allocations;
CREATE POLICY "Scoped read of medicine allocations"
ON public.microplan_medicine_allocations
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_row(auth.uid(), project_id, state, lga, ward, campaign_type)
  )
  OR (
    NOT public.has_active_mda_lens(auth.uid())
    AND created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "coverage_read_scope" ON public.microplan_coverage;
CREATE POLICY "coverage_read_scope"
ON public.microplan_coverage
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_row(auth.uid(), project_id, state, lga, ward, NULL)
  )
  OR (
    NOT public.has_active_mda_lens(auth.uid())
    AND (
      submitted_by = auth.uid()
      OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
    )
  )
);

DROP POLICY IF EXISTS "recon_read_scope" ON public.microplan_reconciliation;
CREATE POLICY "recon_read_scope"
ON public.microplan_reconciliation
FOR SELECT
TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    public.has_active_mda_lens(auth.uid())
    AND public.mda_lens_allows_row(auth.uid(), project_id, state, lga, ward, NULL)
  )
  OR (
    NOT public.has_active_mda_lens(auth.uid())
    AND (
      submitted_by = auth.uid()
      OR (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
    )
  )
);