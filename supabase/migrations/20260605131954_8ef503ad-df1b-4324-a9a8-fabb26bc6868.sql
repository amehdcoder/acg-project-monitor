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
  v_designation_text TEXT;
  v_designation user_designation := 'data_collector';
BEGIN
  IF NEW.email = 'amehjoey1@gmail.com' THEN
    is_owner_user := true;
    v_approval := 'approved';
  END IF;

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

  v_first_name := COALESCE(v_first_name, '');
  v_last_name := COALESCE(v_last_name, '');

  -- Read the designation chosen during sign up; fall back to data_collector
  -- only when none was provided or the value is unrecognised.
  v_designation_text := NULLIF(TRIM(NEW.raw_user_meta_data->>'designation'), '');
  IF v_designation_text IS NOT NULL THEN
    BEGIN
      v_designation := v_designation_text::user_designation;
    EXCEPTION WHEN others THEN
      v_designation := 'data_collector';
    END;
  END IF;

  INSERT INTO public.profiles (
    user_id, email, first_name, last_name, is_owner, approval_status,
    designation, other_designation, phone_number, alternate_phone,
    alternate_email, state, lga, ward
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_first_name,
    v_last_name,
    is_owner_user,
    v_approval,
    v_designation,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'other_designation'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'alternate_phone'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'alternate_email'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'state'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'lga'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'ward'), '')
  );

  IF is_owner_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

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