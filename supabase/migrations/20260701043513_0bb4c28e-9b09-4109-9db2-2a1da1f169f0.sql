CREATE TABLE public.learning_log_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  field_issue TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'In Progress',
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_log_entries TO authenticated;
GRANT ALL ON public.learning_log_entries TO service_role;

ALTER TABLE public.learning_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view learning log entries"
  ON public.learning_log_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Signed in users can create learning log entries"
  ON public.learning_log_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authors or admins can update learning log entries"
  ON public.learning_log_entries FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'systems_admin') OR public.is_owner(auth.uid()))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'systems_admin') OR public.is_owner(auth.uid()));

CREATE POLICY "Authors or admins can delete learning log entries"
  ON public.learning_log_entries FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'systems_admin') OR public.is_owner(auth.uid()));

CREATE TRIGGER update_learning_log_entries_updated_at
  BEFORE UPDATE ON public.learning_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();