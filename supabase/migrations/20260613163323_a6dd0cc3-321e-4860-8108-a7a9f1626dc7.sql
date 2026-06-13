CREATE OR REPLACE FUNCTION public.office_form_approver_role(_form_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _form_code
    WHEN 'leave' THEN 'hr'
    WHEN 'stationery' THEN 'admin'
    WHEN 'srf' THEN 'safeguarding'
    WHEN 'incident' THEN 'safeguarding'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_assignment_active(_starts_at timestamp with time zone, _expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (_starts_at IS NULL OR _starts_at <= now())
     AND (_expires_at IS NULL OR _expires_at >  now())
$function$;