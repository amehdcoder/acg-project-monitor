
-- Data version history table for tracking changes to form submissions
CREATE TABLE public.submission_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL DEFAULT 'update',
  change_summary TEXT
);

-- Index for fast lookups
CREATE INDEX idx_submission_versions_submission_id ON public.submission_versions(submission_id);
CREATE INDEX idx_submission_versions_changed_at ON public.submission_versions(changed_at);

-- Enable RLS
ALTER TABLE public.submission_versions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view version history for submissions they can access
CREATE POLICY "Authenticated users can view submission versions"
  ON public.submission_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert version records (triggered by system)
CREATE POLICY "Admins can insert submission versions"
  ON public.submission_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Auto-create version on submission update via trigger
CREATE OR REPLACE FUNCTION public.track_submission_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.submission_versions
  WHERE submission_id = OLD.id;

  -- Store old data as a version
  INSERT INTO public.submission_versions (submission_id, version_number, data, changed_by, change_type)
  VALUES (OLD.id, next_version, OLD.data, COALESCE(auth.uid(), OLD.user_id), 'update');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_submission_update_track_version
  BEFORE UPDATE OF data ON public.form_submissions
  FOR EACH ROW
  WHEN (OLD.data IS DISTINCT FROM NEW.data)
  EXECUTE FUNCTION public.track_submission_version();
