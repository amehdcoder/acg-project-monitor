CREATE TABLE public.submission_edit_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL,
  table_name TEXT NOT NULL DEFAULT 'form_submissions',
  field_key TEXT NOT NULL,
  field_label TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL DEFAULT 'admin_edit',
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_submission_edit_audit_submission ON public.submission_edit_audit (submission_id, changed_at DESC);

GRANT SELECT, INSERT ON public.submission_edit_audit TO authenticated;
GRANT ALL ON public.submission_edit_audit TO service_role;

ALTER TABLE public.submission_edit_audit ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may record an edit they perform (changed_by must be themselves).
CREATE POLICY "Users can log their own edits"
ON public.submission_edit_audit
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = changed_by);

-- Authenticated users (admins/owners use the editor) can read the audit trail.
CREATE POLICY "Authenticated can read edit audit"
ON public.submission_edit_audit
FOR SELECT
TO authenticated
USING (true);