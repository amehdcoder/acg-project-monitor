DROP POLICY IF EXISTS "Service role manages MDA sync job runs" ON public.mda_sync_job_runs;
CREATE POLICY "Service role manages MDA sync job runs" ON public.mda_sync_job_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages owner emails" ON public.owner_emails;
CREATE POLICY "Service role manages owner emails" ON public.owner_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);