
-- Add approval_status column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

-- Update existing profiles to 'approved' so current users aren't locked out
UPDATE public.profiles SET approval_status = 'approved';

-- Update the handle_new_user function to set pending status for non-owner users
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_owner_user BOOLEAN := false;
  v_first_name TEXT;
  v_last_name TEXT;
  v_full_name TEXT;
  v_approval TEXT := 'pending';
BEGIN
  -- Check if this is the owner email
  IF NEW.email = 'amehjoey1@gmail.com' THEN
    is_owner_user := true;
    v_approval := 'approved';
  END IF;

  -- Extract name: try first_name/last_name from metadata first
  v_first_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'given_name'), ''),
    NULL
  );
  v_last_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'family_name'), ''),
    NULL
  );

  -- If still no name, try full_name / name and split
  IF v_first_name IS NULL THEN
    v_full_name := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      ''
    );
    IF v_full_name != '' THEN
      v_first_name := SPLIT_PART(v_full_name, ' ', 1);
      v_last_name := COALESCE(NULLIF(TRIM(SUBSTRING(v_full_name FROM POSITION(' ' IN v_full_name) + 1)), ''), v_last_name);
    END IF;
  END IF;

  -- Final fallback
  v_first_name := COALESCE(v_first_name, '');
  v_last_name := COALESCE(v_last_name, '');

  -- Create profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name, is_owner, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    v_first_name,
    v_last_name,
    is_owner_user,
    v_approval
  );

  -- Assign role
  IF is_owner_user THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  -- Notify super admins about new registration
  INSERT INTO public.notifications (user_id, title, message, type, category)
  SELECT ur.user_id, 
         '🆕 New User Registration',
         v_first_name || ' ' || v_last_name || ' (' || NEW.email || ') has registered and is pending approval.',
         'warning',
         'registration'
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin';

  RETURN NEW;
END;
$function$;
