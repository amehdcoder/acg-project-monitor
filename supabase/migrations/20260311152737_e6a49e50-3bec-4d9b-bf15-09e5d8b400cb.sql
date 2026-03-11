
-- Table for daily submission targets per form per user
CREATE TABLE public.form_daily_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  daily_target integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, user_id)
);

-- Enable RLS
ALTER TABLE public.form_daily_targets ENABLE ROW LEVEL SECURITY;

-- Admins can manage all targets
CREATE POLICY "Admins can manage all targets"
  ON public.form_daily_targets
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Users can view their own targets
CREATE POLICY "Users can view their own targets"
  ON public.form_daily_targets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_form_daily_targets_updated_at
  BEFORE UPDATE ON public.form_daily_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
