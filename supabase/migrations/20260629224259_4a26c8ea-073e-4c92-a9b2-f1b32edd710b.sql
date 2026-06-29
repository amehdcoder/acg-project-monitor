-- After-hours submission approval system
CREATE TABLE public.after_hours_submission_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_name text,
  target_table text NOT NULL,
  form_label text,
  payload jsonb NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.after_hours_submission_requests TO authenticated;
GRANT ALL ON public.after_hours_submission_requests TO service_role;

ALTER TABLE public.after_hours_submission_requests ENABLE ROW LEVEL SECURITY;

-- Who can review a request for a given project
CREATE OR REPLACE FUNCTION public.can_review_after_hours(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'systems_admin') OR public.is_co_owner(auth.uid()))
      AND p_project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_project_assignments upa
        WHERE upa.user_id = auth.uid()
          AND upa.project_id = p_project_id
          AND (upa.starts_at IS NULL OR upa.starts_at <= now())
          AND (upa.expires_at IS NULL OR upa.expires_at > now())
      )
    )
$$;

-- Requester sees own; reviewers see those they can review
CREATE POLICY "view own or reviewable after-hours requests"
ON public.after_hours_submission_requests
FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.can_review_after_hours(project_id)
);

-- Requester creates own request (status must be pending)
CREATE POLICY "create own after-hours request"
ON public.after_hours_submission_requests
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid() AND status = 'pending');

-- Reviewers / owner can delete reviewed records (cleanup)
CREATE POLICY "reviewers manage after-hours requests"
ON public.after_hours_submission_requests
FOR DELETE
TO authenticated
USING (requested_by = auth.uid() OR public.can_review_after_hours(project_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_after_hours_updated
BEFORE UPDATE ON public.after_hours_submission_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allowed submission tables
CREATE OR REPLACE FUNCTION public._after_hours_allowed_tables()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY[
  'form_submissions','ces_surveys','ces_household_visits','irf_reports','acsm_reports',
  'sbc_reports','seeclear_monitoring','ntd_assessments','standard_assessment_submissions',
  'office_form_submissions','uprp_submissions','microplan_entries','bloomberg_validations',
  'attendance_records','stock_requests','feedback','quiz_attempts'
]::text[] $$;

-- Submit a request; resolves project scope server-side
CREATE OR REPLACE FUNCTION public.request_after_hours_submission(
  p_table text,
  p_payload jsonb,
  p_reason text,
  p_form_label text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_project uuid;
  v_obj jsonb;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (p_table = ANY (public._after_hours_allowed_tables())) THEN
    RAISE EXCEPTION 'Table % is not gated', p_table;
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  v_obj := CASE WHEN jsonb_typeof(p_payload) = 'array' THEN p_payload->0 ELSE p_payload END;

  v_project := p_project_id;
  IF v_project IS NULL AND v_obj ? 'project_id' AND (v_obj->>'project_id') <> '' THEN
    v_project := (v_obj->>'project_id')::uuid;
  END IF;
  IF v_project IS NULL AND v_obj ? 'form_id' THEN
    SELECT f.project_id INTO v_project FROM public.forms f WHERE f.id = (v_obj->>'form_id')::uuid;
  END IF;
  IF v_project IS NULL AND v_obj ? 'survey_id' THEN
    SELECT s.project_id INTO v_project FROM public.ces_surveys s WHERE s.id = (v_obj->>'survey_id')::uuid;
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.after_hours_submission_requests
    (requested_by, requested_by_name, target_table, form_label, payload, project_id, reason)
  VALUES
    (auth.uid(), v_name, p_table, p_form_label, p_payload, v_project, btrim(p_reason))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Internal: insert one object honoring column defaults
CREATE OR REPLACE FUNCTION public._after_hours_insert_one(p_table text, p_obj jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE collist text;
BEGIN
  SELECT string_agg(quote_ident(key), ',') INTO collist
  FROM jsonb_object_keys(p_obj) AS key
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = key
  );
  IF collist IS NULL THEN RAISE EXCEPTION 'No matching columns for %', p_table; END IF;
  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
    p_table, collist, collist, p_table
  ) USING p_obj;
END;
$$;

-- Approve: replays the submission with original timestamp
CREATE OR REPLACE FUNCTION public.approve_after_hours_request(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; elem jsonb; obj jsonb;
BEGIN
  SELECT * INTO r FROM public.after_hours_submission_requests WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.can_review_after_hours(r.project_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  IF NOT (r.target_table = ANY (public._after_hours_allowed_tables())) THEN
    RAISE EXCEPTION 'Table not allowed';
  END IF;

  IF jsonb_typeof(r.payload) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(r.payload) LOOP
      obj := elem || jsonb_build_object('created_at', to_jsonb(r.created_at));
      PERFORM public._after_hours_insert_one(r.target_table, obj);
    END LOOP;
  ELSE
    obj := r.payload || jsonb_build_object('created_at', to_jsonb(r.created_at));
    PERFORM public._after_hours_insert_one(r.target_table, obj);
  END IF;

  UPDATE public.after_hours_submission_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_id;
END;
$$;

-- Reject: discards the submission
CREATE OR REPLACE FUNCTION public.reject_after_hours_request(p_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.after_hours_submission_requests WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.can_review_after_hours(r.project_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  UPDATE public.after_hours_submission_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  WHERE id = p_id;
END;
$$;

ALTER TABLE public.after_hours_submission_requests REPLICA IDENTITY FULL;
