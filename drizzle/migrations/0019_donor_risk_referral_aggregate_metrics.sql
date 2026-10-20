CREATE OR REPLACE FUNCTION public.donor_project_aggregates(_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_donor_viewer(_project_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  WITH b AS (
    SELECT id,status,state,lga,created_at,NULLIF(profile->>'sex','') AS sex,
      CASE WHEN profile->>'age' ~ '^\d{1,3}$' THEN (profile->>'age')::int ELSE NULL END AS age,
      COALESCE(profile->'wg_ss'->>'has_disability','false') = 'true' AS has_disability
    FROM public.beneficiaries WHERE project_id = _project_id
  ), s AS (SELECT component_key,service_date,created_at FROM public.beneficiary_services WHERE project_id = _project_id)
  SELECT jsonb_build_object(
    'total_beneficiaries',(SELECT count(*) FROM b),
    'active_beneficiaries',(SELECT count(*) FROM b WHERE COALESCE(status,'active') = 'active'),
    'by_sex',(SELECT COALESCE(jsonb_object_agg(COALESCE(sex,'Unknown'),n),'{}'::jsonb) FROM (SELECT sex,count(*) n FROM b GROUP BY sex) t),
    'by_state',(SELECT COALESCE(jsonb_object_agg(state,n),'{}'::jsonb) FROM (SELECT COALESCE(state,'Unknown') state,count(*) n FROM b GROUP BY 1) t),
    'by_lga',(SELECT COALESCE(jsonb_object_agg(state || ' / ' || lga,n),'{}'::jsonb) FROM (SELECT COALESCE(state,'Unknown') state,COALESCE(lga,'Unknown') lga,count(*) n FROM b GROUP BY 1,2) t),
    'by_age_band',(SELECT COALESCE(jsonb_object_agg(band,n),'{}'::jsonb) FROM (SELECT CASE WHEN age < 5 THEN '0-4' WHEN age < 15 THEN '5-14' WHEN age < 25 THEN '15-24' WHEN age < 50 THEN '25-49' WHEN age < 65 THEN '50-64' ELSE '65+' END band,count(*) n FROM b WHERE age IS NOT NULL GROUP BY 1) t),
    'with_disability',(SELECT count(*) FROM b WHERE has_disability),
    'total_services',(SELECT count(*) FROM s),
    'services_by_component',(SELECT COALESCE(jsonb_object_agg(COALESCE(component_key,'general'),n),'{}'::jsonb) FROM (SELECT component_key,count(*) n FROM s GROUP BY component_key) t),
    'services_by_month',(SELECT COALESCE(jsonb_agg(jsonb_build_object('month',m,'count',n) ORDER BY m),'[]'::jsonb) FROM (SELECT to_char(date_trunc('month',COALESCE(service_date::timestamptz,created_at)),'YYYY-MM') m,count(*) n FROM s GROUP BY 1) t),
    'registrations_by_month',(SELECT COALESCE(jsonb_agg(jsonb_build_object('month',m,'count',n) ORDER BY m),'[]'::jsonb) FROM (SELECT to_char(date_trunc('month',created_at),'YYYY-MM') m,count(*) n FROM b GROUP BY 1) t),
    'home_visits_completed',(SELECT count(*) FROM public.beneficiary_home_visits WHERE project_id = _project_id AND status = 'completed'),
    'referrals_total',(SELECT count(*) FROM public.beneficiary_referrals WHERE project_id = _project_id),
    'feedback_total',(SELECT count(*) FROM public.project_feedback WHERE project_id = _project_id)
  ) INTO result;
  RETURN result || jsonb_build_object(
    'referrals_completed',(SELECT count(*) FROM public.beneficiary_referrals WHERE project_id = _project_id AND status = 'completed'),
    'referral_completion_pct',(SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE status = 'completed') / NULLIF(count(*),0),2),0) FROM public.beneficiary_referrals WHERE project_id = _project_id),
    'risk_by_level',(SELECT COALESCE(jsonb_object_agg(level,n),'{}'::jsonb) FROM (SELECT COALESCE(NULLIF(lower(risk_level),''),'unclassified') level,count(*) n FROM public.beneficiaries WHERE project_id = _project_id GROUP BY 1) t),
    'overdue_followups',(SELECT count(*) FROM public.beneficiaries WHERE project_id = _project_id AND next_follow_up_date < (now() AT TIME ZONE 'Africa/Lagos')::date AND COALESCE(status,'active') = 'active'),
    'overdue_home_visits',(SELECT count(*) FROM public.beneficiary_home_visits WHERE project_id = _project_id AND status IN ('dispatched','in_progress') AND due_date < (now() AT TIME ZONE 'Africa/Lagos')::date)
  );
END; $$;
REVOKE ALL ON FUNCTION public.donor_project_aggregates(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_project_aggregates(UUID) TO authenticated, service_role;