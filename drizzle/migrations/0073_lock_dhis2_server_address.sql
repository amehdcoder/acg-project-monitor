CREATE OR REPLACE FUNCTION public.guard_exchange_base_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- trusted server code
  IF TG_OP = 'INSERT' OR NEW.base_url IS DISTINCT FROM OLD.base_url THEN
    IF NOT public.is_owner_or_co_owner(auth.uid()) THEN
      RAISE EXCEPTION 'Only the Owner or a Co-owner can set or change a DHIS2 server address' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_exchange_base_url() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_exchange_base_url ON public.health_exchange_connections;
CREATE TRIGGER guard_exchange_base_url BEFORE INSERT OR UPDATE ON public.health_exchange_connections
FOR EACH ROW EXECUTE FUNCTION public.guard_exchange_base_url();