
REVOKE EXECUTE ON FUNCTION public.owner_delete_records(text, uuid[], boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owner_bulk_delete_records(text, timestamptz, timestamptz, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owner_restore_records(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_level(uuid) FROM anon;
