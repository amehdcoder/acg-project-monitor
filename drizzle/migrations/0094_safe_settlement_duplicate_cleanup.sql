CREATE OR REPLACE FUNCTION public.remove_duplicate_settlements(_project_id uuid, _pairs jsonb)
RETURNS uuid[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 p jsonb; a public.microplan_entries; b public.microplan_entries;
 removed uuid[] := ARRAY[]::uuid[]; n integer; f text;
 ignored text[] := ARRAY['id','created_at','updated_at','created_by','external_ref','idempotency_key','state','lga','ward','flhf_name','community_name','settlement_name'];
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid())) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF _project_id IS NULL OR jsonb_typeof(_pairs) IS DISTINCT FROM 'array' OR jsonb_array_length(_pairs) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select 1 to 500 duplicate copies'; END IF;
 -- Lock all originals and copies in stable order; RLS remains in force.
 PERFORM id FROM public.microplan_entries WHERE project_id = _project_id AND id IN (SELECT (x->>'keepId')::uuid FROM jsonb_array_elements(_pairs) x UNION SELECT (x->>'removeId')::uuid FROM jsonb_array_elements(_pairs) x) ORDER BY id FOR UPDATE;
 FOR p IN SELECT value FROM jsonb_array_elements(_pairs) LOOP
  SELECT * INTO a FROM public.microplan_entries WHERE id = (p->>'keepId')::uuid AND project_id = _project_id;
  SELECT * INTO b FROM public.microplan_entries WHERE id = (p->>'removeId')::uuid AND project_id = _project_id;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR EXISTS (SELECT 1 FROM jsonb_array_elements(_pairs) x WHERE x->>'removeId' = p->>'keepId') THEN RAISE EXCEPTION 'Records changed or are not accessible; refresh and review again'; END IF;
  FOREACH f IN ARRAY ARRAY['state','lga','ward','flhf_name','community_name','settlement_name'] LOOP
   IF btrim(coalesce(to_jsonb(a)->>f,'')) = '' OR lower(regexp_replace(btrim(to_jsonb(a)->>f),'\s+',' ','g')) IS DISTINCT FROM lower(regexp_replace(btrim(to_jsonb(b)->>f),'\s+',' ','g')) THEN RAISE EXCEPTION 'Settlement identity does not match'; END IF;
  END LOOP;
  IF (to_jsonb(a) - ignored) IS DISTINCT FROM (to_jsonb(b) - ignored) THEN RAISE EXCEPTION 'Settlement evidence differs; review these copies manually'; END IF;
  DELETE FROM public.microplan_entries WHERE id = b.id AND project_id = _project_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Removal permission denied'; END IF;
  removed := array_append(removed,b.id);
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.remove_duplicate_settlements(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_duplicate_settlements(uuid,jsonb) TO authenticated;