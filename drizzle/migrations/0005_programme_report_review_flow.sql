ALTER TABLE public.programme_reports
  ADD COLUMN status text NOT NULL DEFAULT 'submitted',
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN resolution_note text;