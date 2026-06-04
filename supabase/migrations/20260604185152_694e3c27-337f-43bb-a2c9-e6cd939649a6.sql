
CREATE TABLE public.workplans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  project_no TEXT,
  developed_by TEXT,
  working_title TEXT NOT NULL,
  programme_area TEXT NOT NULL DEFAULT 'ntd',
  donor_partner TEXT,
  start_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  end_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workplan_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workplan_id UUID NOT NULL REFERENCES public.workplans(id) ON DELETE CASCADE,
  result TEXT NOT NULL DEFAULT 'Result 1',
  activity TEXT NOT NULL,
  responsible_person TEXT,
  responsible_email TEXT,
  target TEXT,
  support_needed BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'medium',
  start_date DATE,
  due_date DATE NOT NULL,
  quarters TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  comment TEXT,
  non_implementation_reason TEXT,
  reason_provided_at TIMESTAMPTZ,
  last_reminder_stage TEXT NOT NULL DEFAULT 'none',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workplans TO authenticated;
GRANT ALL ON public.workplans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workplan_activities TO authenticated;
GRANT ALL ON public.workplan_activities TO service_role;

ALTER TABLE public.workplans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workplan_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own workplans"
ON public.workplans FOR ALL TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users manage activities of their workplans"
ON public.workplan_activities FOR ALL TO authenticated
USING (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM public.workplans w WHERE w.id = workplan_id AND w.created_by = auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM public.workplans w WHERE w.id = workplan_id AND w.created_by = auth.uid())
);

CREATE INDEX idx_workplan_activities_workplan ON public.workplan_activities(workplan_id);
CREATE INDEX idx_workplan_activities_due ON public.workplan_activities(due_date);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_workplans_updated_at
BEFORE UPDATE ON public.workplans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workplan_activities_updated_at
BEFORE UPDATE ON public.workplan_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
