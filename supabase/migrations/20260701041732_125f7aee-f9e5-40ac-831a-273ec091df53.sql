
-- Helper: can the user manage dashboards (Owner, Co-owner via is_owner, or admin roles)
CREATE OR REPLACE FUNCTION public.can_manage_dashboards(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_owner(_user_id)
     OR public.has_role(_user_id, 'super_admin')
     OR public.has_role(_user_id, 'systems_admin')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND (is_owner = true OR is_co_owner = true))
$$;

-- ============ dashboard_access ============
CREATE TABLE public.dashboard_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, user_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_access TO authenticated;
GRANT ALL ON public.dashboard_access TO service_role;

ALTER TABLE public.dashboard_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see own dashboard access"
ON public.dashboard_access FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers grant dashboard access"
ON public.dashboard_access FOR INSERT TO authenticated
WITH CHECK (public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers update dashboard access"
ON public.dashboard_access FOR UPDATE TO authenticated
USING (public.can_manage_dashboards(auth.uid()))
WITH CHECK (public.can_manage_dashboards(auth.uid()));

CREATE POLICY "Managers remove dashboard access"
ON public.dashboard_access FOR DELETE TO authenticated
USING (public.can_manage_dashboards(auth.uid()));

-- ============ irf_archived_reports ============
CREATE TABLE public.irf_archived_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid NOT NULL,
  project_id uuid,
  payload jsonb NOT NULL,
  reason text,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.irf_archived_reports TO authenticated;
GRANT ALL ON public.irf_archived_reports TO service_role;

ALTER TABLE public.irf_archived_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view archived irf reports"
ON public.irf_archived_reports FOR SELECT TO authenticated
USING (public.is_owner(auth.uid()));

CREATE POLICY "Owners manage archived irf reports"
ON public.irf_archived_reports FOR ALL TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- ============ Owner-only duplicate management RPCs ============

-- Permanently delete duplicate IRF reports.
CREATE OR REPLACE FUNCTION public.owner_delete_irf_duplicates(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner can delete reports';
  END IF;
  WITH del AS (
    DELETE FROM public.irf_reports WHERE id = ANY(_ids) RETURNING id
  )
  SELECT count(*) INTO _count FROM del;
  RETURN _count;
END;
$$;

-- Archive (soft-remove) duplicate IRF reports into irf_archived_reports.
CREATE OR REPLACE FUNCTION public.owner_archive_irf_duplicates(_ids uuid[], _reason text DEFAULT 'duplicate')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner can archive reports';
  END IF;
  INSERT INTO public.irf_archived_reports (report_id, project_id, payload, reason, archived_by)
  SELECT r.id, r.project_id, to_jsonb(r), _reason, auth.uid()
  FROM public.irf_reports r WHERE r.id = ANY(_ids);

  WITH del AS (
    DELETE FROM public.irf_reports WHERE id = ANY(_ids) RETURNING id
  )
  SELECT count(*) INTO _count FROM del;
  RETURN _count;
END;
$$;

-- Restore a previously archived IRF report.
CREATE OR REPLACE FUNCTION public.owner_restore_irf_report(_archive_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payload jsonb;
  _report_id uuid;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Owner can restore reports';
  END IF;
  SELECT payload INTO _payload FROM public.irf_archived_reports WHERE id = _archive_id;
  IF _payload IS NULL THEN
    RAISE EXCEPTION 'Archived report not found';
  END IF;
  INSERT INTO public.irf_reports
  SELECT * FROM jsonb_populate_record(NULL::public.irf_reports, _payload)
  ON CONFLICT (id) DO NOTHING;
  _report_id := (_payload->>'id')::uuid;
  DELETE FROM public.irf_archived_reports WHERE id = _archive_id;
  RETURN _report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_delete_irf_duplicates(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_archive_irf_duplicates(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_restore_irf_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_dashboards(uuid) TO authenticated;

-- Realtime for dashboard access grants
ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_access;
