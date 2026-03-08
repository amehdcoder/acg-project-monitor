
-- Create form_templates table
CREATE TABLE public.form_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage all templates
CREATE POLICY "Admins can manage templates"
  ON public.form_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- All authenticated users can view published templates
CREATE POLICY "Users can view published templates"
  ON public.form_templates
  FOR SELECT
  TO authenticated
  USING (is_published = true);

-- Add updated_at trigger
CREATE TRIGGER update_form_templates_updated_at
  BEFORE UPDATE ON public.form_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
