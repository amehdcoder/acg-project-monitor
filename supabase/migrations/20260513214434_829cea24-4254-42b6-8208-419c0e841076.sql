
CREATE INDEX IF NOT EXISTS idx_ces_witness_logs_dedupe
  ON public.ces_witness_logs (witness_device_hash, survey_id, household_id, witness_timestamp DESC);

CREATE OR REPLACE FUNCTION public.submit_witness_verification(
  _survey_id uuid,
  _household_id uuid,
  _device_hash text,
  _lat double precision,
  _lng double precision,
  _window_hours int DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_at timestamptz;
  v_id uuid;
  v_ts timestamptz := now();
BEGIN
  IF _device_hash IS NULL OR length(_device_hash) < 16 THEN
    RAISE EXCEPTION 'Invalid device fingerprint' USING ERRCODE = '22023';
  END IF;

  -- Duplicate prevention: same device + same household/survey within window
  SELECT witness_timestamp INTO v_existing_at
  FROM public.ces_witness_logs
  WHERE witness_device_hash = _device_hash
    AND survey_id IS NOT DISTINCT FROM _survey_id
    AND household_id IS NOT DISTINCT FROM _household_id
    AND witness_timestamp > (v_ts - make_interval(hours => GREATEST(_window_hours, 1)))
  ORDER BY witness_timestamp DESC
  LIMIT 1;

  IF v_existing_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'previous_at', v_existing_at,
      'window_hours', _window_hours
    );
  END IF;

  -- Lightweight per-device rate limit: max 5 submissions / 10 minutes (any survey)
  IF (
    SELECT count(*) FROM public.ces_witness_logs
    WHERE witness_device_hash = _device_hash
      AND witness_timestamp > (v_ts - interval '10 minutes')
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'rate_limited', true);
  END IF;

  INSERT INTO public.ces_witness_logs
    (survey_id, household_id, witness_device_hash, witness_lat, witness_long, witness_timestamp)
  VALUES
    (_survey_id, _household_id, _device_hash, _lat, _lng, v_ts)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'at', v_ts);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_witness_verification(uuid, uuid, text, double precision, double precision, int) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_witness_verification(uuid, uuid, text, double precision, double precision, int) TO anon, authenticated;
