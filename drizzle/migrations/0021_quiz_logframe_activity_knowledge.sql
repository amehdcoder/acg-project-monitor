ALTER TABLE public.quizzes ADD COLUMN logframe_activity_code text;
COMMENT ON COLUMN public.quizzes.logframe_activity_code IS 'Explicit project logframe activity code; never infer activity from quiz title.';
CREATE OR REPLACE FUNCTION public.validate_quiz_activity_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE framework jsonb;
BEGIN
 IF NEW.logframe_activity_code IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.logframe_activity_code IS NOT DISTINCT FROM OLD.logframe_activity_code AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
 IF NEW.project_id IS NULL OR length(NEW.logframe_activity_code)>150 THEN RAISE EXCEPTION 'A project and valid activity code are required'; END IF;
 SELECT data INTO framework FROM public.programme_logframes WHERE project_id=NEW.project_id;
 IF framework IS NULL THEN RAISE EXCEPTION 'Save the project framework before linking an assessment'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(framework->'objectives') o CROSS JOIN LATERAL jsonb_array_elements(o->'results') r CROSS JOIN LATERAL jsonb_array_elements(r->'activities') a WHERE a->>'code'=NEW.logframe_activity_code AND lower(a->>'indicator') LIKE '%change%knowledge%') THEN RAISE EXCEPTION 'Choose an existing knowledge-change activity in this project'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_quiz_activity_link BEFORE INSERT OR UPDATE OF logframe_activity_code,project_id ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.validate_quiz_activity_link();
REVOKE ALL ON FUNCTION public.validate_quiz_activity_link() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.programme_knowledge_metrics(_project_id uuid,_start timestamptz,_end timestamptz) RETURNS TABLE(activity_code text,paired bigint,improved bigint,mean_gain numeric,quiz_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_programme_officer(_project_id) OR public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.projects WHERE id=_project_id AND created_by=auth.uid())) THEN RAISE EXCEPTION 'Programme reporting access required'; END IF;
 IF _start IS NULL OR _end IS NULL OR _end<=_start THEN RAISE EXCEPTION 'Valid report dates required'; END IF;
 RETURN QUERY WITH observations AS (
 SELECT q.id quiz_id,q.logframe_activity_code code,'app:'||a.user_id::text participant,a.attempt_type test,a.percentage::numeric percentage,a.completed_at at,a.id::text tie FROM public.quizzes q JOIN public.quiz_attempts a ON a.quiz_id=q.id WHERE q.project_id=_project_id AND q.logframe_activity_code IS NOT NULL AND a.completed_at IS NOT NULL AND a.percentage IS NOT NULL
 UNION ALL SELECT q.id,q.logframe_activity_code,'external:'||r.participant_key,r.assessment_type,r.percentage,r.submitted_at,r.id::text FROM public.quizzes q JOIN public.quiz_external_results r ON r.quiz_id=q.id WHERE q.project_id=_project_id AND q.logframe_activity_code IS NOT NULL
 UNION ALL SELECT q.id,q.logframe_activity_code,'kobo:'||r.participant_key,r.assessment_type,r.percentage,r.submitted_at,r.id::text FROM public.quizzes q JOIN public.quiz_kobo_submissions r ON r.quiz_id=q.id WHERE q.project_id=_project_id AND q.logframe_activity_code IS NOT NULL AND r.percentage IS NOT NULL AND r.participant_key IS NOT NULL
 ), posts AS (SELECT DISTINCT ON(quiz_id,participant) * FROM observations WHERE test='post_test' AND at>=_start AND at<_end ORDER BY quiz_id,participant,at DESC,tie DESC), pairs AS (
 SELECT p.code,p.quiz_id,p.participant,p.percentage-pre.percentage gain FROM posts p CROSS JOIN LATERAL (SELECT o.percentage FROM observations o WHERE o.quiz_id=p.quiz_id AND o.participant=p.participant AND o.test='pre_test' AND o.at<=p.at ORDER BY o.at DESC,o.tie DESC LIMIT 1) pre
 ) SELECT p.code,count(*),count(*) FILTER(WHERE p.gain>0),avg(p.gain),count(DISTINCT p.quiz_id) FROM pairs p GROUP BY p.code;
END $$;
REVOKE ALL ON FUNCTION public.programme_knowledge_metrics(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.programme_knowledge_metrics(uuid,timestamptz,timestamptz) TO authenticated,service_role;