-- Central predicate: TRUE when the caller is allowed to write (not a lens-only user).
CREATE OR REPLACE FUNCTION public.mda_lens_write_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (NOT public.has_active_mda_lens(_user_id))
      OR public.is_owner_or_co_owner(_user_id)
      OR public.is_admin(_user_id)
$$;

REVOKE ALL ON FUNCTION public.mda_lens_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mda_lens_write_allowed(uuid) TO authenticated, service_role;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'microplan_entries',
    'microplan_delete_requests',
    'microplan_coverage',
    'microplan_reconciliation',
    'microplan_medicine_allocations',
    'microplan_allocation_history',
    'microplan_missing_communities',
    'form_submissions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lens_readonly_no_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lens_readonly_no_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lens_readonly_no_delete_' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.mda_lens_write_allowed(auth.uid()))',
      'lens_readonly_no_insert_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.mda_lens_write_allowed(auth.uid())) WITH CHECK (public.mda_lens_write_allowed(auth.uid()))',
      'lens_readonly_no_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.mda_lens_write_allowed(auth.uid()))',
      'lens_readonly_no_delete_' || t, t);
  END LOOP;
END $$;

-- Older, narrower restrictive policies are now redundant.
DROP POLICY IF EXISTS "Lens users cannot update microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Lens users cannot delete microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Lens users cannot request microplan deletions" ON public.microplan_delete_requests;

-- SECURITY DEFINER writer bypasses RLS: enforce the same rule inside it.
CREATE OR REPLACE FUNCTION public.update_submission_guarded(p_id uuid, p_expected_version integer, p_data jsonb, p_status text DEFAULT NULL::text, p_location jsonb DEFAULT NULL::jsonb, p_within_geofence boolean DEFAULT NULL::boolean)
 RETURNS TABLE(id uuid, form_id uuid, user_id uuid, data jsonb, location jsonb, within_geofence boolean, status text, version integer, updated_at timestamp with time zone, conflict boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current public.form_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- MDA Lens users are strictly read-only, even through this definer path.
  IF NOT public.mda_lens_write_allowed(auth.uid()) THEN
    RAISE EXCEPTION 'MDA Lens access is read-only: submissions cannot be edited';
  END IF;

  SELECT * INTO v_current FROM public.form_submissions WHERE public.form_submissions.id = p_id;

  IF NOT FOUND THEN
    RETURN;  -- caller treats empty result as "insert new"
  END IF;

  IF v_current.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized to update this submission';
  END IF;

  IF v_current.version IS DISTINCT FROM p_expected_version THEN
    RETURN QUERY SELECT
      v_current.id, v_current.form_id, v_current.user_id, v_current.data,
      v_current.location, v_current.within_geofence, v_current.status,
      v_current.version, v_current.updated_at, true;
    RETURN;
  END IF;

  UPDATE public.form_submissions AS fs SET
    data = p_data,
    status = COALESCE(p_status, fs.status),
    location = COALESCE(p_location, fs.location),
    within_geofence = COALESCE(p_within_geofence, fs.within_geofence)
  WHERE fs.id = p_id
  RETURNING
    fs.id, fs.form_id, fs.user_id, fs.data, fs.location, fs.within_geofence,
    fs.status, fs.version, fs.updated_at, false
  INTO id, form_id, user_id, data, location, within_geofence, status, version, updated_at, conflict;

  RETURN NEXT;
END;
$function$;

-- Delete requests are applied by a definer trigger fn; block lens-initiated applies too.
CREATE OR REPLACE FUNCTION public.microplan_lens_block_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.mda_lens_write_allowed(auth.uid()) THEN
    RAISE EXCEPTION 'MDA Lens access is read-only: this record cannot be created, edited or deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS lens_block_write_microplan_entries ON public.microplan_entries;
CREATE TRIGGER lens_block_write_microplan_entries
BEFORE INSERT OR UPDATE OR DELETE ON public.microplan_entries
FOR EACH ROW EXECUTE FUNCTION public.microplan_lens_block_write();

DROP TRIGGER IF EXISTS lens_block_write_microplan_delete_requests ON public.microplan_delete_requests;
CREATE TRIGGER lens_block_write_microplan_delete_requests
BEFORE INSERT OR UPDATE OR DELETE ON public.microplan_delete_requests
FOR EACH ROW EXECUTE FUNCTION public.microplan_lens_block_write();