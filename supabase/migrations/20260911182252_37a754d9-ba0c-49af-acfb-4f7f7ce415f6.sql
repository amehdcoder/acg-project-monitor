-- 1) Notify focal persons of the receiving facility when a referral is created
CREATE OR REPLACE FUNCTION public.notify_referral_focal_persons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_facility text;
  r record;
BEGIN
  IF NEW.to_facility_id IS NULL THEN RETURN NEW; END IF;

  SELECT full_name INTO v_name FROM public.beneficiaries WHERE id = NEW.beneficiary_id;
  SELECT name INTO v_facility FROM public.health_facilities WHERE id = NEW.to_facility_id;

  FOR r IN
    SELECT user_id FROM public.facility_focal_persons
    WHERE facility_id = NEW.to_facility_id AND is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
    VALUES (
      r.user_id,
      CASE WHEN NEW.urgency IN ('urgent','emergency') THEN 'warning' ELSE 'info' END,
      'New referral to ' || coalesce(v_facility, 'your facility'),
      coalesce(v_name, 'A beneficiary') || ' was referred to ' || coalesce(v_facility, 'your facility')
        || ' (' || coalesce(NEW.urgency, 'routine') || ')'
        || coalesce(' — ' || NEW.reason, ''),
      'referral',
      NEW.id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_referral_focal_persons() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_referral_focal_persons ON public.beneficiary_referrals;
CREATE TRIGGER trg_notify_referral_focal_persons
AFTER INSERT ON public.beneficiary_referrals
FOR EACH ROW EXECUTE FUNCTION public.notify_referral_focal_persons();

-- 2) Deletion approval workflow
CREATE TABLE IF NOT EXISTS public.beneficiary_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  beneficiary_name text NOT NULL,
  case_id text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.beneficiary_delete_requests TO authenticated;
GRANT ALL ON public.beneficiary_delete_requests TO service_role;

ALTER TABLE public.beneficiary_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bdr_project_status
  ON public.beneficiary_delete_requests (project_id, status);

CREATE OR REPLACE FUNCTION public.can_approve_beneficiary_delete(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner(_user_id)
      OR public.is_co_owner(_user_id)
      OR (
        public.has_role(_user_id, 'super_admin')
        AND EXISTS (
          SELECT 1 FROM public.user_project_assignments upa
          WHERE upa.user_id = _user_id AND upa.project_id = _project_id
        )
      );
$$;

REVOKE ALL ON FUNCTION public.can_approve_beneficiary_delete(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_approve_beneficiary_delete(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins create delete requests" ON public.beneficiary_delete_requests;
CREATE POLICY "Admins create delete requests"
  ON public.beneficiary_delete_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Requesters and approvers read delete requests" ON public.beneficiary_delete_requests;
CREATE POLICY "Requesters and approvers read delete requests"
  ON public.beneficiary_delete_requests FOR SELECT TO authenticated
  USING (
    requested_by = (SELECT auth.uid())
    OR public.can_approve_beneficiary_delete((SELECT auth.uid()), project_id)
  );

DROP POLICY IF EXISTS "Approvers decide delete requests" ON public.beneficiary_delete_requests;
CREATE POLICY "Approvers decide delete requests"
  ON public.beneficiary_delete_requests FOR UPDATE TO authenticated
  USING (public.can_approve_beneficiary_delete((SELECT auth.uid()), project_id))
  WITH CHECK (public.can_approve_beneficiary_delete((SELECT auth.uid()), project_id));

DROP TRIGGER IF EXISTS trg_bdr_updated_at ON public.beneficiary_delete_requests;
CREATE TRIGGER trg_bdr_updated_at
BEFORE UPDATE ON public.beneficiary_delete_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify approvers when a deletion request is raised
CREATE OR REPLACE FUNCTION public.notify_beneficiary_delete_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
      AND public.can_approve_beneficiary_delete(ur.user_id, NEW.project_id)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
    VALUES (r.user_id, 'warning', 'Beneficiary deletion needs approval',
            NEW.beneficiary_name || ' (' || coalesce(NEW.case_id, 'no case ID') || ') was requested for deletion',
            'approval', NEW.id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_beneficiary_delete_request() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_beneficiary_delete_request ON public.beneficiary_delete_requests;
CREATE TRIGGER trg_notify_beneficiary_delete_request
AFTER INSERT ON public.beneficiary_delete_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_beneficiary_delete_request();

-- Approve / decline in one guarded call
CREATE OR REPLACE FUNCTION public.decide_beneficiary_delete_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE req record;
BEGIN
  SELECT * INTO req FROM public.beneficiary_delete_requests WHERE id = _request_id;
  IF req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
  IF NOT public.can_approve_beneficiary_delete(auth.uid(), req.project_id) THEN
    RAISE EXCEPTION 'Not authorised to review this request';
  END IF;

  UPDATE public.beneficiary_delete_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = _note
   WHERE id = _request_id;

  IF _approve THEN
    DELETE FROM public.beneficiaries WHERE id = req.beneficiary_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, category, related_id)
  VALUES (req.requested_by,
          CASE WHEN _approve THEN 'success' ELSE 'info' END,
          CASE WHEN _approve THEN 'Beneficiary deletion approved' ELSE 'Beneficiary deletion declined' END,
          req.beneficiary_name || ' — ' || CASE WHEN _approve THEN 'record deleted' ELSE 'request declined' END
            || coalesce(': ' || _note, ''),
          'approval', _request_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_beneficiary_delete_request(uuid, boolean, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_beneficiary_delete_request(uuid, boolean, text) TO authenticated, service_role;