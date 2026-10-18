ALTER TABLE public.programme_report_officers ADD COLUMN IF NOT EXISTS is_reviewer boolean NOT NULL DEFAULT false;
GRANT UPDATE ON public.programme_report_officers TO authenticated;
CREATE POLICY "officers updated by owner and super admin" ON public.programme_report_officers FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = programme_report_officers.project_id AND p.created_by = auth.uid()))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR EXISTS (SELECT 1 FROM projects p WHERE p.id = programme_report_officers.project_id AND p.created_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_programme_report_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.resolution_note IS DISTINCT FROM OLD.resolution_note)
     AND NOT (
       has_role(auth.uid(), 'super_admin'::app_role)
       OR EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.created_by = auth.uid())
       OR EXISTS (SELECT 1 FROM programme_report_officers o WHERE o.project_id = NEW.project_id AND o.user_id = auth.uid() AND o.is_reviewer)
     ) THEN
    RAISE EXCEPTION 'Only designated report reviewers can review programme reports';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_programme_report_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_programme_report_review ON public.programme_reports;
CREATE TRIGGER trg_guard_programme_report_review BEFORE UPDATE ON public.programme_reports FOR EACH ROW EXECUTE FUNCTION public.guard_programme_report_review();