
ALTER TABLE public.forms ADD COLUMN template_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL DEFAULT NULL;
