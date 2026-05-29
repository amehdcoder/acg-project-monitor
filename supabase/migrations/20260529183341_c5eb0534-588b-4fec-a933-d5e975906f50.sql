-- ============================================================
-- PHASE 1: Case Management data model foundation
-- ============================================================

-- 1. Extend case_types with visual + workflow config
ALTER TABLE public.case_types
  ADD COLUMN IF NOT EXISTS icon text DEFAULT 'Folder',
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS status_workflow jsonb DEFAULT '["open","closed"]'::jsonb,
  ADD COLUMN IF NOT EXISTS sharing_default text DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS workflow_rules jsonb DEFAULT '[]'::jsonb;

-- 2. Human-readable sequential case reference code
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS sharing_level text DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS parent_case_id uuid;

CREATE SEQUENCE IF NOT EXISTS public.case_reference_seq;

CREATE OR REPLACE FUNCTION public.set_case_reference_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_code IS NULL THEN
    NEW.reference_code := 'CASE-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.case_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_case_reference_code ON public.cases;
CREATE TRIGGER trg_set_case_reference_code
  BEFORE INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_case_reference_code();

-- Backfill reference codes for existing cases
UPDATE public.cases
SET reference_code = 'CASE-' || to_char(COALESCE(opened_at, created_at, now()), 'YYYY') || '-' ||
  lpad(nextval('public.case_reference_seq')::text, 5, '0')
WHERE reference_code IS NULL;

-- 3. case_permissions (sharing)
CREATE TABLE IF NOT EXISTS public.case_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  shared_with_user_id uuid,
  share_level text NOT NULL DEFAULT 'private',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_permissions_case ON public.case_permissions(case_id);
CREATE INDEX IF NOT EXISTS idx_case_permissions_user ON public.case_permissions(shared_with_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_permissions TO authenticated;
GRANT ALL ON public.case_permissions TO service_role;

-- 4. Security-definer accessor used by all child-table RLS
CREATE OR REPLACE FUNCTION public.can_access_case(_user_id uuid, _case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = _case_id
        AND (
          c.owner_id = _user_id
          OR c.project_id IN (
            SELECT upa.project_id FROM public.user_project_assignments upa
            WHERE upa.user_id = _user_id
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.case_permissions cp
      WHERE cp.case_id = _case_id AND cp.shared_with_user_id = _user_id
    );
$$;

ALTER TABLE public.case_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View case permissions for accessible cases"
  ON public.case_permissions FOR SELECT
  USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Manage case permissions for accessible cases"
  ON public.case_permissions FOR ALL
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));

-- parent_case_id FK (after cases exists)
ALTER TABLE public.cases
  DROP CONSTRAINT IF EXISTS cases_parent_case_id_fkey;
ALTER TABLE public.cases
  ADD CONSTRAINT cases_parent_case_id_fkey
  FOREIGN KEY (parent_case_id) REFERENCES public.cases(id) ON DELETE SET NULL;

-- 5. case_referrals
CREATE TABLE IF NOT EXISTS public.case_referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  referral_type text,
  destination text,
  reason text,
  priority text DEFAULT 'normal',
  expected_date date,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  accepted_by uuid,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_referrals_case ON public.case_referrals(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_referrals TO authenticated;
GRANT ALL ON public.case_referrals TO service_role;
ALTER TABLE public.case_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access referrals for accessible cases"
  ON public.case_referrals FOR ALL
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));
CREATE TRIGGER trg_case_referrals_updated
  BEFORE UPDATE ON public.case_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. case_notes
CREATE TABLE IF NOT EXISTS public.case_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id uuid,
  note text NOT NULL,
  visibility text NOT NULL DEFAULT 'team',
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_notes_case ON public.case_notes(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_notes TO authenticated;
GRANT ALL ON public.case_notes TO service_role;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access notes for accessible cases"
  ON public.case_notes FOR ALL
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));

-- 7. case_relationships (parent-child / indices)
CREATE TABLE IF NOT EXISTS public.case_relationships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  child_case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'child',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_case_id, child_case_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_case_rel_parent ON public.case_relationships(parent_case_id);
CREATE INDEX IF NOT EXISTS idx_case_rel_child ON public.case_relationships(child_case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_relationships TO authenticated;
GRANT ALL ON public.case_relationships TO service_role;
ALTER TABLE public.case_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access relationships for accessible cases"
  ON public.case_relationships FOR ALL
  USING (public.can_access_case(auth.uid(), parent_case_id) OR public.can_access_case(auth.uid(), child_case_id))
  WITH CHECK (public.can_access_case(auth.uid(), parent_case_id));

-- 8. case_tasks (follow-up scheduling)
CREATE TABLE IF NOT EXISTS public.case_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  created_by uuid,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_tasks_case ON public.case_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_due ON public.case_tasks(due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_tasks TO authenticated;
GRANT ALL ON public.case_tasks TO service_role;
ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access tasks for accessible cases"
  ON public.case_tasks FOR ALL
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));
CREATE TRIGGER trg_case_tasks_updated
  BEFORE UPDATE ON public.case_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. case_attachments
CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_attachments_case ON public.case_attachments(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access attachments for accessible cases"
  ON public.case_attachments FOR ALL
  USING (public.can_access_case(auth.uid(), case_id))
  WITH CHECK (public.can_access_case(auth.uid(), case_id));

-- 10. case_status_history
CREATE TABLE IF NOT EXISTS public.case_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_status_history_case ON public.case_status_history(case_id);
GRANT SELECT, INSERT ON public.case_status_history TO authenticated;
GRANT ALL ON public.case_status_history TO service_role;
ALTER TABLE public.case_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View status history for accessible cases"
  ON public.case_status_history FOR SELECT
  USING (public.can_access_case(auth.uid(), case_id));
CREATE POLICY "Insert status history for accessible cases"
  ON public.case_status_history FOR INSERT
  WITH CHECK (public.can_access_case(auth.uid(), case_id));