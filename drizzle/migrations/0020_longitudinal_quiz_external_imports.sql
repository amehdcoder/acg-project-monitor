ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS source_platform text;
CREATE TABLE public.quiz_external_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
 participant_key text NOT NULL, participant_name text NOT NULL, assessment_type text NOT NULL,
 percentage numeric NOT NULL, cohort text, state text, lga text, designation text,
 submitted_at timestamptz NOT NULL, imported_by uuid NOT NULL,
 UNIQUE(quiz_id,participant_key,assessment_type),
 CHECK (assessment_type IN ('pre_test','post_test')), CHECK (percentage BETWEEN 0 AND 100)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.quiz_external_results TO authenticated;
GRANT ALL ON public.quiz_external_results TO service_role;
ALTER TABLE public.quiz_external_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage imported quiz results" ON public.quiz_external_results FOR ALL TO authenticated USING(public.is_admin(auth.uid())) WITH CHECK(public.is_admin(auth.uid()) AND imported_by=auth.uid());
CREATE POLICY "Quiz analytics viewers read imported results" ON public.quiz_external_results FOR SELECT TO authenticated USING(public.has_quiz_analytics_access(quiz_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.import_quiz_questions(p_quiz_id uuid, p_questions jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; n integer:=0;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 PERFORM id FROM public.quizzes WHERE id=p_quiz_id AND NOT coalesce(is_published,false) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an unpublished quiz'; END IF;
 IF jsonb_typeof(p_questions)<>'array' OR jsonb_array_length(p_questions)<1 OR jsonb_array_length(p_questions)>300 THEN RAISE EXCEPTION 'Import 1 to 300 questions'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF length(trim(item->>'question_text'))<1 OR jsonb_typeof(item->'options')<>'array' OR jsonb_array_length(item->'options')<2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'options') o WHERE o->>'value'=item->>'correct_answer') OR coalesce((item->>'points')::numeric,0)<=0 THEN RAISE EXCEPTION 'Every question needs options, a verified answer and positive points'; END IF;
 END LOOP;
 SELECT coalesce(max(sort_order)+1,0) INTO n FROM public.quiz_questions WHERE quiz_id=p_quiz_id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  INSERT INTO public.quiz_questions(quiz_id,question_text,question_type,options,correct_answer,points,sort_order) VALUES(p_quiz_id,item->>'question_text','select_one',item->'options',item->>'correct_answer',(item->>'points')::numeric,n);
  n:=n+1;
 END LOOP;
 RETURN jsonb_array_length(p_questions);
END $$;
REVOKE ALL ON FUNCTION public.import_quiz_questions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_quiz_questions(uuid,jsonb) TO authenticated,service_role;