-- Tighten execution rights on Owner MDA data-management functions.
REVOKE ALL ON FUNCTION public.owner_mda_data_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_clear_form_submissions(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.owner_mda_data_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_archive_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_mda_submissions(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_clear_form_submissions(uuid) TO authenticated;

-- Pair the existing Owner-only archive policies with matching table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mda_archived_submissions TO authenticated;
GRANT ALL ON public.mda_archived_submissions TO service_role;