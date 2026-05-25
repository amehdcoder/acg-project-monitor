
-- 1. Approver assignment table
CREATE TABLE IF NOT EXISTS public.office_form_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_role text NOT NULL CHECK (approver_role IN ('hr','admin','safeguarding')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approver_role)
);

ALTER TABLE public.office_form_approvers ENABLE ROW LEVEL SECURITY;

-- Helper function: is this user an approver for given role?
CREATE OR REPLACE FUNCTION public.is_office_approver(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.office_form_approvers
    WHERE user_id = _user_id AND approver_role = _role
  );
$$;

-- RLS for approvers table
CREATE POLICY "Anyone authed can view approvers"
  ON public.office_form_approvers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage approvers - insert"
  ON public.office_form_approvers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins manage approvers - delete"
  ON public.office_form_approvers FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Approval columns on submissions
ALTER TABLE public.office_form_submissions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','in_progress','closed')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approver_notes text,
  ADD COLUMN IF NOT EXISTS approver_action text,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS approved_items jsonb;

-- Map form_code → approver role
CREATE OR REPLACE FUNCTION public.office_form_approver_role(_form_code text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _form_code
    WHEN 'leave' THEN 'hr'
    WHEN 'stationery' THEN 'admin'
    WHEN 'srf' THEN 'safeguarding'
    WHEN 'incident' THEN 'safeguarding'
    ELSE NULL
  END;
$$;

-- 3. Extend RLS so approvers can view/update relevant submissions
DROP POLICY IF EXISTS "Users view office submissions" ON public.office_form_submissions;
CREATE POLICY "Users and approvers view office submissions"
  ON public.office_form_submissions FOR SELECT TO authenticated
  USING (
    auth.uid() = submitted_by
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
  );

DROP POLICY IF EXISTS "Users update office submissions" ON public.office_form_submissions;
CREATE POLICY "Users and approvers update office submissions"
  ON public.office_form_submissions FOR UPDATE TO authenticated
  USING (
    auth.uid() = submitted_by
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_office_approver(auth.uid(), public.office_form_approver_role(form_code))
  );
