ALTER TABLE public.bloomberg_school_baselines
  ADD COLUMN IF NOT EXISTS ss1_male int,
  ADD COLUMN IF NOT EXISTS ss1_female int,
  ADD COLUMN IF NOT EXISTS ss1_total int,
  ADD COLUMN IF NOT EXISTS ss2_male int,
  ADD COLUMN IF NOT EXISTS ss2_female int,
  ADD COLUMN IF NOT EXISTS ss2_total int,
  ADD COLUMN IF NOT EXISTS ss3_male int,
  ADD COLUMN IF NOT EXISTS ss3_female int,
  ADD COLUMN IF NOT EXISTS ss3_total int;

CREATE OR REPLACE FUNCTION public.owner_reset_bloomberg_validation_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_owner(v_user) THEN
    RAISE EXCEPTION 'Only the Owner may reset Bloomberg validation data';
  END IF;

  DELETE FROM public.bloomberg_validations;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'reset', true,
    'validations_deleted', v_deleted,
    'at', now(),
    'by', v_user
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_reset_bloomberg_validation_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_reset_bloomberg_validation_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_reset_bloomberg_validation_data() TO service_role;