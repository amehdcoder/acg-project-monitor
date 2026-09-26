CREATE TABLE public.brain_models (
  brain_key text PRIMARY KEY,
  module_id uuid NOT NULL REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  checkpoint jsonb NOT NULL,
  steps integer NOT NULL DEFAULT 0,
  corpus_rows integer NOT NULL DEFAULT 0,
  columns integer NOT NULL DEFAULT 0,
  val_loss double precision,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.brain_models TO authenticated;
GRANT ALL ON public.brain_models TO service_role;
ALTER TABLE public.brain_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members read brain" ON public.brain_models FOR SELECT TO authenticated
  USING (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));
CREATE POLICY "Project members save brain" ON public.brain_models FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));
CREATE POLICY "Project members update brain" ON public.brain_models FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));

-- Never let a less-trained copy overwrite a more-trained shared brain.
CREATE OR REPLACE FUNCTION public.brain_models_keep_most_trained()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.steps < OLD.steps THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER brain_models_keep_most_trained BEFORE UPDATE ON public.brain_models
  FOR EACH ROW EXECUTE FUNCTION public.brain_models_keep_most_trained();
REVOKE EXECUTE ON FUNCTION public.brain_models_keep_most_trained() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.brain_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.programme_modules(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  case_id text,
  level text NOT NULL DEFAULT 'review',
  row_score double precision NOT NULL DEFAULT 0,
  cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  reason_code text,
  reason_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  first_flagged_at timestamptz NOT NULL DEFAULT now(),
  last_flagged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, beneficiary_id)
);
GRANT SELECT, INSERT, UPDATE ON public.brain_flags TO authenticated;
GRANT ALL ON public.brain_flags TO service_role;
ALTER TABLE public.brain_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members read flags" ON public.brain_flags FOR SELECT TO authenticated
  USING (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));
CREATE POLICY "Project members add flags" ON public.brain_flags FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));
CREATE POLICY "Project members update flags" ON public.brain_flags FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())) OR project_id IN (SELECT upa.project_id FROM user_project_assignments upa WHERE upa.user_id = (SELECT auth.uid())));
CREATE INDEX brain_flags_module_status_idx ON public.brain_flags(module_id, status);