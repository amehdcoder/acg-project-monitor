
-- 1. Remove direct-delete rights from non-admin project members
DROP POLICY IF EXISTS "Form access users can delete own microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Project members can delete own microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Project-granted users can delete own microplan entries" ON public.microplan_entries;

-- 2. Create the delete-request table
CREATE TABLE public.microplan_delete_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.microplan_entries(id) ON DELETE CASCADE,
  project_id UUID,
  requester_id UUID NOT NULL,
  requester_reason TEXT NOT NULL CHECK (length(trim(requester_reason)) >= 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by UUID,
  decider_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_del_req_entry ON public.microplan_delete_requests(entry_id);
CREATE INDEX idx_mp_del_req_requester ON public.microplan_delete_requests(requester_id);
CREATE INDEX idx_mp_del_req_status ON public.microplan_delete_requests(status);
CREATE INDEX idx_mp_del_req_project ON public.microplan_delete_requests(project_id);

-- Prevent duplicate pending requests per entry
CREATE UNIQUE INDEX idx_mp_del_req_one_pending
  ON public.microplan_delete_requests(entry_id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.microplan_delete_requests TO authenticated;
GRANT ALL ON public.microplan_delete_requests TO service_role;

ALTER TABLE public.microplan_delete_requests ENABLE ROW LEVEL SECURITY;

-- Requester can create a request for an entry they own
CREATE POLICY "Users can request deletion of own entries"
ON public.microplan_delete_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'pending'
  AND decided_by IS NULL
  AND decided_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.microplan_entries e
    WHERE e.id = entry_id AND e.created_by = auth.uid()
  )
);

-- Requester can view their own requests; admins/owner can view all
CREATE POLICY "Requester and admins can view delete requests"
ON public.microplan_delete_requests
FOR SELECT TO authenticated
USING (
  requester_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR public.is_owner(auth.uid())
);

-- Only admins/owner can update (approve or reject) — must supply reason
CREATE POLICY "Admins can decide delete requests"
ON public.microplan_delete_requests
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  AND status IN ('approved','rejected')
  AND decided_by = auth.uid()
  AND decider_reason IS NOT NULL
  AND length(trim(decider_reason)) >= 5
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.microplan_delete_requests_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_microplan_delete_requests_touch
BEFORE UPDATE ON public.microplan_delete_requests
FOR EACH ROW EXECUTE FUNCTION public.microplan_delete_requests_touch();

-- On approval: delete the target entry (SECURITY DEFINER so it works regardless of RLS)
CREATE OR REPLACE FUNCTION public.microplan_delete_requests_apply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.decided_at := COALESCE(NEW.decided_at, now());
    DELETE FROM public.microplan_entries WHERE id = NEW.entry_id;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.decided_at := COALESCE(NEW.decided_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_microplan_delete_requests_apply
BEFORE UPDATE ON public.microplan_delete_requests
FOR EACH ROW EXECUTE FUNCTION public.microplan_delete_requests_apply();
