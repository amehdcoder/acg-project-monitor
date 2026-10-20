CREATE OR REPLACE FUNCTION public.store_external_quiz_responses(p_sync_id uuid,p_responses jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.quiz_external_syncs; r jsonb; saved integer; n integer:=0; participant text; submitted timestamptz;
BEGIN
 SELECT * INTO s FROM public.quiz_external_syncs WHERE id=p_sync_id AND enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active sync required'; END IF;
 IF NOT public.is_admin(s.owner_id) THEN RAISE EXCEPTION 'Connection administrator access revoked'; END IF;
 IF jsonb_typeof(p_responses)<>'array' OR jsonb_array_length(p_responses)>300 THEN RAISE EXCEPTION 'At most 300 responses per batch'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_responses) LOOP
  participant:=lower(trim(r->>'participant_key')); submitted:=(r->>'submitted_at')::timestamptz;
  IF participant IS NULL OR participant='' OR nullif(r->>'response_id','') IS NULL OR nullif(r->>'participant_name','') IS NULL OR submitted IS NULL OR (r->>'percentage') IS NULL OR (r->>'percentage')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Invalid response'; END IF;
  INSERT INTO public.quiz_external_responses(sync_id,response_id,participant_key,submitted_at,answers,schema_hash) VALUES(s.id,r->>'response_id',participant,submitted,coalesce(r->'answers','{}'::jsonb),s.schema_hash)
   ON CONFLICT(sync_id,response_id) DO UPDATE SET participant_key=excluded.participant_key,submitted_at=excluded.submitted_at,answers=excluded.answers,schema_hash=excluded.schema_hash WHERE quiz_external_responses.submitted_at<excluded.submitted_at;
  GET DIAGNOSTICS saved=ROW_COUNT;
  IF saved=0 THEN CONTINUE; END IF;
  INSERT INTO public.quiz_external_results(quiz_id,participant_key,participant_name,assessment_type,percentage,submitted_at,cohort,state,lga,designation,imported_by)
   VALUES(s.quiz_id,participant,r->>'participant_name',s.assessment_type,(r->>'percentage')::numeric,submitted,r->>'cohort',r->>'state',r->>'lga',r->>'designation',s.owner_id)
   ON CONFLICT(quiz_id,participant_key,assessment_type) DO UPDATE SET participant_name=excluded.participant_name,percentage=excluded.percentage,submitted_at=excluded.submitted_at,cohort=excluded.cohort,state=excluded.state,lga=excluded.lga,designation=excluded.designation,imported_by=excluded.imported_by WHERE quiz_external_results.submitted_at<=excluded.submitted_at;
  n:=n+1;
 END LOOP;
 UPDATE public.quiz_external_syncs SET imported_count=imported_count+n WHERE id=s.id;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.store_external_quiz_responses(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_external_quiz_responses(uuid,jsonb) TO service_role;