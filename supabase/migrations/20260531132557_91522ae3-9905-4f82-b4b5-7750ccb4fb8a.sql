CREATE TABLE public.uprp_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name_of_data_collector text NOT NULL,
  type_of_training text NOT NULL,
  training_center text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  location jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uprp_submissions TO authenticated;
GRANT ALL ON public.uprp_submissions TO service_role;

ALTER TABLE public.uprp_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own uprp submissions"
ON public.uprp_submissions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own uprp submissions"
ON public.uprp_submissions FOR SELECT
USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

CREATE POLICY "Users update own uprp submissions"
ON public.uprp_submissions FOR UPDATE
USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

CREATE POLICY "Users delete own uprp submissions"
ON public.uprp_submissions FOR DELETE
USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

CREATE INDEX idx_uprp_user ON public.uprp_submissions (user_id);
CREATE INDEX idx_uprp_project ON public.uprp_submissions (project_id);
CREATE INDEX idx_uprp_created ON public.uprp_submissions (created_at DESC);

CREATE TRIGGER trg_uprp_updated_at
BEFORE UPDATE ON public.uprp_submissions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('uprp-uploads', 'uprp-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "uprp uploads publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'uprp-uploads');

CREATE POLICY "uprp users upload own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uprp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "uprp users update own"
ON storage.objects FOR UPDATE
USING (bucket_id = 'uprp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "uprp users delete own"
ON storage.objects FOR DELETE
USING (bucket_id = 'uprp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);