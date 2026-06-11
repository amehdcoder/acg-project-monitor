CREATE TABLE public.user_standard_form_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_code TEXT NOT NULL,
  assigned_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_standard_form_assignments TO authenticated;
GRANT ALL ON public.user_standard_form_assignments TO service_role;

ALTER TABLE public.user_standard_form_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own standard form assignments"
ON public.user_standard_form_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage standard form assignments"
ON public.user_standard_form_assignments
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));