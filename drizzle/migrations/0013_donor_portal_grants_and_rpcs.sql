
-- Donor portal: explicit project-scoped, aggregate-only access for donor users.

CREATE TABLE public.donor_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  organization TEXT,
  label TEXT,
  granted_by UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_viewers TO authenticated;
GRANT ALL ON public.donor_viewers TO service_role;

ALTER TABLE public.donor_viewers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_donor_viewer(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.donor_viewers
    WHERE project_id = _project_id
      AND user_id = auth.uid()
      AND active
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_donor_viewer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_donor_viewer(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_donor_viewers(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.created_by = auth.uid()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_donor_viewers(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_donor_viewers(UUID) TO authenticated;

CREATE POLICY "Donors view own grants"
  ON public.donor_viewers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_donor_viewers(project_id));

CREATE POLICY "Managers add donors"
  ON public.donor_viewers FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_donor_viewers(project_id));

CREATE POLICY "Managers update donors"
  ON public.donor_viewers FOR UPDATE TO authenticated
  USING (public.can_manage_donor_viewers(project_id))
  WITH CHECK (public.can_manage_donor_viewers(project_id));

CREATE POLICY "Managers remove donors"
  ON public.donor_viewers FOR DELETE TO authenticated
  USING (public.can_manage_donor_viewers(project_id));

CREATE POLICY "Donors view programme reports"
  ON public.programme_reports FOR SELECT TO authenticated
  USING (public.is_donor_viewer(project_id));

CREATE POLICY "Donors view programme report entries"
  ON public.programme_report_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.programme_reports r
    WHERE r.id = programme_report_entries.report_id
      AND public.is_donor_viewer(r.project_id)
  ));

CREATE POLICY "Donors view programme logframes"
  ON public.programme_logframes FOR SELECT TO authenticated
  USING (public.is_donor_viewer(project_id));

-- Aggregate-only beneficiary insights: grouped counts, no row-level data.
-- Sex, age and disability live inside beneficiaries.profile JSON.
CREATE OR REPLACE FUNCTION public.donor_project_aggregates(_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_donor_viewer(_project_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  WITH b AS (
    SELECT id, status, state, lga, created_at,
           NULLIF(profile->>'sex', '') AS sex,
           NULLIF(profile->>'age', '')::int AS age,
           COALESCE((profile->'wg_ss'->>'has_disability')::boolean, false) AS has_disability
      FROM public.beneficiaries WHERE project_id = _project_id
  ),
  s AS (
    SELECT component_key, service_date, created_at
      FROM public.beneficiary_services WHERE project_id = _project_id
  )
  SELECT jsonb_build_object(
    'total_beneficiaries', (SELECT count(*) FROM b),
    'active_beneficiaries', (SELECT count(*) FROM b WHERE COALESCE(status, 'active') = 'active'),
    'by_sex', (SELECT COALESCE(jsonb_object_agg(COALESCE(sex, 'Unknown'), n), '{}'::jsonb)
               FROM (SELECT sex, count(*) n FROM b GROUP BY sex) t),
    'by_state', (SELECT COALESCE(jsonb_object_agg(state, n), '{}'::jsonb)
                 FROM (SELECT COALESCE(state, 'Unknown') state, count(*) n FROM b GROUP BY 1) t),
    'by_lga', (SELECT COALESCE(jsonb_object_agg(state || ' / ' || lga, n), '{}'::jsonb)
               FROM (SELECT COALESCE(state, 'Unknown') state, COALESCE(lga, 'Unknown') lga, count(*) n
                     FROM b GROUP BY 1, 2) t),
    'by_age_band', (SELECT COALESCE(jsonb_object_agg(band, n), '{}'::jsonb) FROM (
      SELECT CASE
               WHEN age < 5 THEN '0-4'
               WHEN age < 15 THEN '5-14'
               WHEN age < 25 THEN '15-24'
               WHEN age < 50 THEN '25-49'
               WHEN age < 65 THEN '50-64'
               ELSE '65+' END band, count(*) n
        FROM b WHERE age IS NOT NULL GROUP BY 1) t),
    'with_disability', (SELECT count(*) FROM b WHERE has_disability),
    'total_services', (SELECT count(*) FROM s),
    'services_by_component', (SELECT COALESCE(jsonb_object_agg(COALESCE(component_key, 'general'), n), '{}'::jsonb)
                              FROM (SELECT component_key, count(*) n FROM s GROUP BY component_key) t),
    'services_by_month', (SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m), '[]'::jsonb)
                          FROM (SELECT to_char(date_trunc('month', COALESCE(service_date::timestamptz, created_at)), 'YYYY-MM') m, count(*) n
                                FROM s GROUP BY 1) t),
    'registrations_by_month', (SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m), '[]'::jsonb)
                               FROM (SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n
                                     FROM b GROUP BY 1) t),
    'home_visits_completed', (SELECT count(*) FROM public.beneficiary_home_visits
                              WHERE project_id = _project_id AND status = 'completed'),
    'referrals_total', (SELECT count(*) FROM public.beneficiary_referrals WHERE project_id = _project_id),
    'feedback_total', (SELECT count(*) FROM public.project_feedback WHERE project_id = _project_id)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.donor_project_aggregates(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.donor_project_aggregates(UUID) TO authenticated;

-- Non-identifying recent field activity for granted projects.
CREATE OR REPLACE FUNCTION public.donor_field_activity(_project_id UUID, _limit INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_donor_viewer(_project_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'kind', kind, 'summary', summary, 'component', component,
    'state', state, 'lga', lga, 'occurred_at', occurred_at
  ) ORDER BY occurred_at DESC)
  INTO result
  FROM (
    SELECT 'service'::text kind,
           COALESCE(service_name, 'Service recorded')::text summary,
           component_key::text component,
           NULL::text state, NULL::text lga,
           COALESCE(service_date::timestamptz, created_at) occurred_at
      FROM public.beneficiary_services WHERE project_id = _project_id
    UNION ALL
    SELECT 'home_visit', 'Home visit ' || COALESCE(status, 'recorded'),
           NULL, NULL, NULL,
           COALESCE(visited_at, created_at)
      FROM public.beneficiary_home_visits WHERE project_id = _project_id
    UNION ALL
    SELECT 'feedback', 'Community feedback: ' || COALESCE(category, 'general'),
           NULL, state, lga,
           created_at
      FROM public.project_feedback WHERE project_id = _project_id
    ORDER BY 7 DESC
    LIMIT GREATEST(1, LEAST(_limit, 100))
  ) feed;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.donor_field_activity(UUID, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.donor_field_activity(UUID, INT) TO authenticated;
