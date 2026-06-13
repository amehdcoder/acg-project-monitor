
-- ============ Bloomberg schools (identity only, no baseline) ============
CREATE TABLE public.bloomberg_schools (
  school_key text PRIMARY KEY,
  label text,
  school_name text NOT NULL,
  school_code text,
  school_type text,
  school_level text,
  ownership text,
  state text, lga text, ward text, location text,
  state_label text, lga_label text, ward_label text, location_label text,
  baseline_scope text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bloomberg_schools TO authenticated;
GRANT ALL ON public.bloomberg_schools TO service_role;
ALTER TABLE public.bloomberg_schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read schools" ON public.bloomberg_schools
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner level manage schools" ON public.bloomberg_schools
  FOR ALL TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

-- ============ Bloomberg baselines (OWNER/ADMIN only) ============
CREATE TABLE public.bloomberg_school_baselines (
  school_key text PRIMARY KEY REFERENCES public.bloomberg_schools(school_key) ON DELETE CASCADE,
  p1_male int, p1_female int, p1_total int,
  p2_male int, p2_female int, p2_total int,
  p3_male int, p3_female int, p3_total int,
  p4_male int, p4_female int, p4_total int,
  p5_male int, p5_female int, p5_total int,
  p6_male int, p6_female int, p6_total int,
  jss1_male int, jss1_female int, jss1_total int,
  jss2_male int, jss2_female int, jss2_total int,
  jss3_male int, jss3_female int, jss3_total int,
  total_male int, total_female int, grand_total int,
  data_quality_flag text, baseline_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bloomberg_school_baselines TO authenticated;
GRANT ALL ON public.bloomberg_school_baselines TO service_role;
ALTER TABLE public.bloomberg_school_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/admin read baselines" ON public.bloomberg_school_baselines
  FOR SELECT TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "Owner manage baselines" ON public.bloomberg_school_baselines
  FOR ALL TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

-- ============ Bloomberg validations (submissions) ============
CREATE TABLE public.bloomberg_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_key text REFERENCES public.bloomberg_schools(school_key) ON DELETE SET NULL,
  state text, lga text, ward text, location text,
  school_name text, school_code text, school_type text, school_level text, ownership text,
  gps_lat double precision, gps_lng double precision, gps_accuracy double precision,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrolment jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_male int, total_female int, grand_total int,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,
  status text NOT NULL DEFAULT 'sent',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloomberg_validations TO authenticated;
GRANT ALL ON public.bloomberg_validations TO service_role;
ALTER TABLE public.bloomberg_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Validators manage own validations" ON public.bloomberg_validations
  FOR ALL TO authenticated
  USING (validator_id = auth.uid())
  WITH CHECK (validator_id = auth.uid());
CREATE POLICY "Owner/admin read all validations" ON public.bloomberg_validations
  FOR SELECT TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_bloomberg_validations_updated
  BEFORE UPDATE ON public.bloomberg_validations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Global cascade scope assignments ============
CREATE TABLE public.user_cascade_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  field_key text NOT NULL,
  value text NOT NULL,
  value_label text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_id, field_key, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cascade_assignments TO authenticated;
GRANT ALL ON public.user_cascade_assignments TO service_role;
ALTER TABLE public.user_cascade_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own cascade scope" ON public.user_cascade_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "Owner manage cascade scope" ON public.user_cascade_assignments
  FOR ALL TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()))
  WITH CHECK (public.is_owner_or_co_owner(auth.uid()));

-- ============ Storage policies for bloomberg-evidence ============
CREATE POLICY "Validators upload own evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bloomberg-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Validators read own evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bloomberg-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_owner_or_co_owner(auth.uid()) OR public.is_admin(auth.uid())));
CREATE POLICY "Validators delete own evidence" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bloomberg-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
