-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'systems_admin', 'user');

-- Create designation enum for Nigerian context
CREATE TYPE public.user_designation AS ENUM (
  'independent_monitor',
  'enumerator',
  'data_collector',
  'electronic_data_manager',
  'community_directed_distributor',
  'flhf_supervisor',
  'lga_supervisor',
  'state_supervisor',
  'hands_staff',
  'cbmg_staff',
  'cbmi_staff',
  'sightsavers_staff',
  'plan_intl_staff',
  'sci_staff',
  'other'
);

-- Create profiles table with Nigerian demographics
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT,
  alternate_phone TEXT,
  alternate_email TEXT,
  designation public.user_designation NOT NULL DEFAULT 'data_collector',
  other_designation TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold')),
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create forms table
CREATE TABLE public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',
  geofence JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'halted', 'closed')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- Create user project assignments
CREATE TABLE public.user_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

-- Create user form assignments
CREATE TABLE public.user_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_id)
);

-- Create form submissions table
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  location JSONB,
  within_geofence BOOLEAN,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'sent')),
  submitted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create admin tasks table
CREATE TABLE public.admin_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rescheduled', 'canceled')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create task audit trail
CREATE TABLE public.task_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.admin_tasks(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  changed_by UUID REFERENCES auth.users(id) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create field activity tracking
CREATE TABLE public.field_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  location JSONB,
  within_geofence BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_form_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_activity ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin (super_admin or systems_admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'systems_admin')
  )
$$;

-- Function to check if user is the owner
CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND is_owner = true
  )
$$;

-- Function to auto-create profile and assign owner role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner_user BOOLEAN := false;
BEGIN
  -- Check if this is the owner email
  IF NEW.email = 'amehjoey1@gmail.com' THEN
    is_owner_user := true;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name, is_owner)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    is_owner_user
  );

  -- Assign role
  IF is_owner_user THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.admin_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Owner cannot have is_owner changed" ON public.profiles FOR UPDATE USING (
  CASE 
    WHEN is_owner = true THEN auth.uid() = user_id
    ELSE true
  END
);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Systems admins can assign user role only" ON public.user_roles FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'systems_admin') AND role = 'user'
);
CREATE POLICY "Owner protection on role changes" ON public.user_roles FOR UPDATE USING (
  NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = user_roles.user_id 
    AND profiles.is_owner = true
    AND auth.uid() != user_roles.user_id
  )
);
CREATE POLICY "Owner protection on role deletion" ON public.user_roles FOR DELETE USING (
  NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = user_roles.user_id 
    AND profiles.is_owner = true
  )
);

-- RLS Policies for projects
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Assigned users can view projects" ON public.projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_project_assignments
    WHERE user_project_assignments.project_id = projects.id
    AND user_project_assignments.user_id = auth.uid()
  )
);

-- RLS Policies for forms
CREATE POLICY "Admins can manage forms" ON public.forms FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Assigned users can view forms" ON public.forms FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_form_assignments
    WHERE user_form_assignments.form_id = forms.id
    AND user_form_assignments.user_id = auth.uid()
  )
);

-- RLS Policies for assignments
CREATE POLICY "Admins can manage project assignments" ON public.user_project_assignments FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view their assignments" ON public.user_project_assignments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage form assignments" ON public.user_form_assignments FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view their form assignments" ON public.user_form_assignments FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for submissions
CREATE POLICY "Users can manage their own submissions" ON public.form_submissions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all submissions" ON public.form_submissions FOR SELECT USING (public.is_admin(auth.uid()));

-- RLS Policies for admin tasks
CREATE POLICY "Admins can manage tasks" ON public.admin_tasks FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view tasks" ON public.admin_tasks FOR SELECT TO authenticated USING (true);

-- RLS Policies for task audit
CREATE POLICY "Admins can manage audit trail" ON public.task_audit_trail FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view audit trail" ON public.task_audit_trail FOR SELECT TO authenticated USING (true);

-- RLS Policies for field activity
CREATE POLICY "Users can manage their own activity" ON public.field_activity FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all activity" ON public.field_activity FOR SELECT USING (public.is_admin(auth.uid()));