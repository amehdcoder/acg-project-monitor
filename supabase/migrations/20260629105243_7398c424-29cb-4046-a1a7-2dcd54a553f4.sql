CREATE OR REPLACE FUNCTION public.owner_delete_assert_allowed(_table text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $function$
BEGIN
  IF _table NOT IN (
    'form_submissions','acsm_reports','irf_reports','sbc_reports',
    'seeclear_monitoring','ntd_assessments','ces_surveys','bloomberg_validations',
    'microplan_entries','office_form_submissions','standard_assessment_submissions',
    'uprp_submissions'
  ) THEN
    RAISE EXCEPTION 'Table % is not eligible for owner deletion', _table;
  END IF;
END;
$function$;