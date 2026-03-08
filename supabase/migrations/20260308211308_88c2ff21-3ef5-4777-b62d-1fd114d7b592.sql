
-- Create user_geofence_assignments table for per-user, per-form geofence boundaries
CREATE TABLE public.user_geofence_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  geofence jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_id)
);

-- Enable RLS
ALTER TABLE public.user_geofence_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage user geofence assignments"
  ON public.user_geofence_assignments FOR ALL
  USING (is_admin(auth.uid()));

-- Users can view their own assignments
CREATE POLICY "Users can view their own geofence assignments"
  ON public.user_geofence_assignments FOR SELECT
  USING (auth.uid() = user_id);
