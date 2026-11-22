CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_attempt(p_quiz_id uuid)
RETURNS TABLE(id uuid, quiz_id uuid, question_text text, question_type text, options jsonb, points numeric, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT q.id, q.quiz_id, q.question_text, q.question_type, q.options, q.points, q.sort_order
  FROM public.quiz_questions q JOIN public.quizzes z ON z.id = q.quiz_id
  WHERE q.quiz_id = p_quiz_id AND auth.uid() IS NOT NULL
    AND (public.is_admin(auth.uid())
         OR (z.is_published = true AND (z.project_id IS NULL OR public.is_project_member(auth.uid(), z.project_id))))
  ORDER BY q.sort_order;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions_for_attempt(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions_for_attempt(uuid) TO authenticated;