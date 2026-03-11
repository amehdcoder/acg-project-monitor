
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_info jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_ip_address text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_device_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS device_phone_number text DEFAULT NULL;
