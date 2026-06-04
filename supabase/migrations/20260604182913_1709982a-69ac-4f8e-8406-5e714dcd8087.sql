CREATE TABLE public.meeting_action_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  meeting_title TEXT NOT NULL,
  meeting_date DATE,
  meeting_type TEXT,
  programme_area TEXT NOT NULL DEFAULT 'ntd',
  action_point TEXT NOT NULL,
  responsible_person TEXT NOT NULL,
  responsible_email TEXT,
  responsible_user_id UUID,
  priority TEXT NOT NULL DEFAULT 'medium',
  start_date DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  progress_notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  non_implementation_reason TEXT,
  reason_provided_at TIMESTAMP WITH TIME ZONE,
  last_reminder_stage TEXT NOT NULL DEFAULT 'none',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_action_points TO authenticated;
GRANT ALL ON public.meeting_action_points TO service_role;

ALTER TABLE public.meeting_action_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view action points"
  ON public.meeting_action_points FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can create action points"
  ON public.meeting_action_points FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Staff can update action points"
  ON public.meeting_action_points FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Creator or admin can delete action points"
  ON public.meeting_action_points FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE INDEX idx_map_due_date ON public.meeting_action_points (due_date);
CREATE INDEX idx_map_status ON public.meeting_action_points (status);
CREATE INDEX idx_map_project ON public.meeting_action_points (project_id);

CREATE TRIGGER update_meeting_action_points_updated_at
  BEFORE UPDATE ON public.meeting_action_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();