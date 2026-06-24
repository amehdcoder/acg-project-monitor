CREATE OR REPLACE FUNCTION public.microplan_distinct_geography(_states text[] DEFAULT NULL::text[], _project_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(state text, lga text, ward text, flhf_name text, community_name text, settlement_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    e.state,
    e.lga,
    e.ward,
    e.flhf_name,
    e.community_name,
    e.settlement_name
  FROM public.microplan_entries e
  WHERE (_states IS NULL OR cardinality(_states) = 0 OR e.state = ANY(_states))
    AND (_project_ids IS NULL OR cardinality(_project_ids) = 0 OR e.project_id = ANY(_project_ids));
$function$;