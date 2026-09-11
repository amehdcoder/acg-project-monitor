CREATE OR REPLACE FUNCTION public.increment_device_records(_device_row_id uuid, _count integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.project_devices
     SET records_sent = records_sent + GREATEST(_count, 0),
         updated_at = now()
   WHERE id = _device_row_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_device_records(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_device_records(uuid, integer) TO service_role;