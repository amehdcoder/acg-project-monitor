ALTER PUBLICATION supabase_realtime ADD TABLE public.bloomberg_validations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seeclear_monitoring;
ALTER TABLE public.bloomberg_validations REPLICA IDENTITY FULL;
ALTER TABLE public.seeclear_monitoring REPLICA IDENTITY FULL;