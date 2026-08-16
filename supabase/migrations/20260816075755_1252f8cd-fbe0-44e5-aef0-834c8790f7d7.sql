REVOKE ALL ON FUNCTION public.can_access_presence_topic(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.presence_topic_project(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_presence_topic(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.presence_topic_project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_presence_topic(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.presence_topic_project(text) TO service_role;