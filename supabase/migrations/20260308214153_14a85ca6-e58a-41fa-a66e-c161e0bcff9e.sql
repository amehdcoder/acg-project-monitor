CREATE TABLE public.sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sync_type text NOT NULL DEFAULT 'google_sheets',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  spreadsheet_id text,
  sheet_name text,
  row_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sync history" ON public.sync_history FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Users can view their own sync history" ON public.sync_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert sync history" ON public.sync_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sync history" ON public.sync_history FOR UPDATE USING (auth.uid() = user_id);