
-- Table for tracking data quality indicators per form
CREATE TABLE public.data_quality_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  completeness_score NUMERIC(5,2) DEFAULT 0,
  accuracy_score NUMERIC(5,2) DEFAULT 0,
  consistency_score NUMERIC(5,2) DEFAULT 0,
  timeliness_score NUMERIC(5,2) DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  total_submissions INTEGER DEFAULT 0,
  complete_submissions INTEGER DEFAULT 0,
  incomplete_submissions INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  geofence_violations INTEGER DEFAULT 0,
  rapid_fire_count INTEGER DEFAULT 0,
  avg_completion_time_seconds INTEGER DEFAULT 0,
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  checked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for tracking data quality issues and cleaning actions
CREATE TABLE public.data_quality_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  field_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for tracking app update notifications
CREATE TABLE public.app_update_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'feature',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_quality_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_update_notifications ENABLE ROW LEVEL SECURITY;

-- RLS for data_quality_indicators: owner and granted super admins
CREATE POLICY "Owner can manage quality indicators" ON public.data_quality_indicators
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Granted admins can view quality indicators" ON public.data_quality_indicators
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = auth.uid() AND page_id = 'data-quality'
    )
  );

-- RLS for data_quality_issues: owner and granted super admins
CREATE POLICY "Owner can manage quality issues" ON public.data_quality_issues
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Granted admins can view quality issues" ON public.data_quality_issues
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = auth.uid() AND page_id = 'data-quality'
    )
  );

CREATE POLICY "Granted admins can update quality issues" ON public.data_quality_issues
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = auth.uid() AND page_id = 'data-quality'
    )
  );

-- RLS for app_update_notifications: owner can manage, users can view for their pages
CREATE POLICY "Owner can manage update notifications" ON public.app_update_notifications
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Admins can insert update notifications" ON public.app_update_notifications
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Users can view update notifications for accessible pages" ON public.app_update_notifications
  FOR SELECT TO authenticated
  USING (
    page_id NOT IN (SELECT unnest(ARRAY['surveillance','field-intelligence','spatial-analysis','statistics','users','math-modeling','ml','feedback','integrations','iteration-analysis','data-quality']))
    OR is_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.admin_page_access
      WHERE user_id = auth.uid() AND page_id = app_update_notifications.page_id
    )
  );

-- Enable realtime for quality issues
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_quality_issues;
