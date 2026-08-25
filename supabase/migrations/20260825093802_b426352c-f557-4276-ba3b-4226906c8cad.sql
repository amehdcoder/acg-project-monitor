CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'first_name','last_name','phone_number','alternate_phone','alternate_email',
    'other_designation','state','lga','ward','notification_preferences','avatar_url',
    'last_seen_at','device_info','last_ip_address','last_device_type',
    'device_phone_number','has_seen_tour','location_tracking_enabled',
    'current_version','updated_at'
  ];
  patch jsonb;
BEGIN
  IF public.is_admin(auth.uid()) OR public.is_owner(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Allow-list model: start from the stored row and apply only the safe fields
  -- from the incoming row. Any column not explicitly listed (including columns
  -- added to profiles in the future) is preserved from OLD by default.
  SELECT jsonb_object_agg(k, v)
    INTO patch
    FROM jsonb_each(to_jsonb(NEW)) AS e(k, v)
   WHERE k = ANY(allowed);

  IF patch IS NULL THEN
    RETURN OLD;
  END IF;

  NEW := jsonb_populate_record(OLD, patch);
  RETURN NEW;
END;
$$;