-- Create table for case types (e.g., "patient", "household", "beneficiary")
CREATE TABLE public.case_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  properties JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

-- Create table for individual cases (instances of case types)
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_type_id UUID NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by UUID NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_by UUID,
  closed_at TIMESTAMP WITH TIME ZONE,
  last_modified_by UUID NOT NULL,
  last_modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for case activities/history
CREATE TABLE public.case_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  form_submission_id UUID REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('registration', 'follow_up', 'update', 'close', 'reopen')),
  performed_by UUID NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changes JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for case_types
CREATE POLICY "Users can view case types in their assigned projects"
ON public.case_types
FOR SELECT
USING (
  project_id IN (
    SELECT project_id FROM public.user_project_assignments WHERE user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins can create case types"
ON public.case_types
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update case types"
ON public.case_types
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete case types"
ON public.case_types
FOR DELETE
USING (public.is_admin(auth.uid()));

-- RLS policies for cases
CREATE POLICY "Users can view cases they own or in assigned projects"
ON public.cases
FOR SELECT
USING (
  owner_id = auth.uid()
  OR project_id IN (
    SELECT project_id FROM public.user_project_assignments WHERE user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Users can create cases in assigned projects"
ON public.cases
FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT project_id FROM public.user_project_assignments WHERE user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Users can update their own cases or admins can update any"
ON public.cases
FOR UPDATE
USING (
  owner_id = auth.uid()
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins can delete cases"
ON public.cases
FOR DELETE
USING (public.is_admin(auth.uid()));

-- RLS policies for case_activities
CREATE POLICY "Users can view activities for cases they can access"
ON public.case_activities
FOR SELECT
USING (
  case_id IN (
    SELECT id FROM public.cases WHERE owner_id = auth.uid()
    UNION
    SELECT c.id FROM public.cases c
    JOIN public.user_project_assignments upa ON c.project_id = upa.project_id
    WHERE upa.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Users can create activities for accessible cases"
ON public.case_activities
FOR INSERT
WITH CHECK (
  case_id IN (
    SELECT id FROM public.cases WHERE owner_id = auth.uid()
    UNION
    SELECT c.id FROM public.cases c
    JOIN public.user_project_assignments upa ON c.project_id = upa.project_id
    WHERE upa.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

-- Create indexes for performance
CREATE INDEX idx_case_types_project ON public.case_types(project_id);
CREATE INDEX idx_cases_case_type ON public.cases(case_type_id);
CREATE INDEX idx_cases_project ON public.cases(project_id);
CREATE INDEX idx_cases_owner ON public.cases(owner_id);
CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_case_activities_case ON public.case_activities(case_id);
CREATE INDEX idx_case_activities_submission ON public.case_activities(form_submission_id);

-- Create trigger for updated_at on case_types
CREATE TRIGGER update_case_types_updated_at
BEFORE UPDATE ON public.case_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for last_modified_at on cases
CREATE OR REPLACE FUNCTION public.update_case_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cases_last_modified
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.update_case_last_modified();