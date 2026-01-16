-- Create table to store custom dashboards
CREATE TABLE public.custom_dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout JSON NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false
);

-- Create table to store dashboard widgets
CREATE TABLE public.dashboard_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES public.custom_dashboards(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL, -- 'bar', 'line', 'pie', 'area', 'radar', 'table', 'kpi', 'text'
  title TEXT NOT NULL,
  config JSON NOT NULL DEFAULT '{}', -- question_id, aggregation, filters, colors, etc.
  position JSON NOT NULL DEFAULT '{"x": 0, "y": 0, "w": 6, "h": 4}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user can access a form's dashboard
CREATE OR REPLACE FUNCTION public.can_access_form_dashboard(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_form_assignments
    WHERE user_id = _user_id AND form_id = _form_id
  ) OR public.is_admin(_user_id)
$$;

-- Create security definer function to check if user can edit dashboards (admin only)
CREATE OR REPLACE FUNCTION public.can_edit_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
$$;

-- RLS Policies for custom_dashboards
-- Users can view dashboards for forms they're assigned to (if published) or if they're admins
CREATE POLICY "Users can view published dashboards for assigned forms"
ON public.custom_dashboards
FOR SELECT
USING (
  (is_published = true AND public.can_access_form_dashboard(auth.uid(), form_id))
  OR public.is_admin(auth.uid())
);

-- Only admins can create dashboards
CREATE POLICY "Admins can create dashboards"
ON public.custom_dashboards
FOR INSERT
WITH CHECK (public.can_edit_dashboard(auth.uid()));

-- Only admins can update dashboards
CREATE POLICY "Admins can update dashboards"
ON public.custom_dashboards
FOR UPDATE
USING (public.can_edit_dashboard(auth.uid()));

-- Only admins can delete dashboards
CREATE POLICY "Admins can delete dashboards"
ON public.custom_dashboards
FOR DELETE
USING (public.can_edit_dashboard(auth.uid()));

-- RLS Policies for dashboard_widgets
-- Users can view widgets if they can view the parent dashboard
CREATE POLICY "Users can view widgets for accessible dashboards"
ON public.dashboard_widgets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.custom_dashboards d
    WHERE d.id = dashboard_id
    AND (
      (d.is_published = true AND public.can_access_form_dashboard(auth.uid(), d.form_id))
      OR public.is_admin(auth.uid())
    )
  )
);

-- Only admins can create widgets
CREATE POLICY "Admins can create widgets"
ON public.dashboard_widgets
FOR INSERT
WITH CHECK (public.can_edit_dashboard(auth.uid()));

-- Only admins can update widgets
CREATE POLICY "Admins can update widgets"
ON public.dashboard_widgets
FOR UPDATE
USING (public.can_edit_dashboard(auth.uid()));

-- Only admins can delete widgets
CREATE POLICY "Admins can delete widgets"
ON public.dashboard_widgets
FOR DELETE
USING (public.can_edit_dashboard(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_custom_dashboards_updated_at
BEFORE UPDATE ON public.custom_dashboards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at
BEFORE UPDATE ON public.dashboard_widgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();