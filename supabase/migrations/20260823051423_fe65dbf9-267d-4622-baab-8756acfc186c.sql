CREATE TABLE public.gps_verification_history (
  id uuid primary key default gen_random_uuid(),
  loc_key text not null,
  submission_id text,
  community text not null default '',
  ward text default '',
  lga text default '',
  state text default '',
  lat double precision not null,
  lng double precision not null,
  status text not null,
  score integer not null default 0,
  matched_name text default '',
  display_name text default '',
  reason text default '',
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_gps_hist_loc ON public.gps_verification_history(loc_key, created_at DESC);
GRANT SELECT, INSERT ON public.gps_verification_history TO authenticated;
GRANT ALL ON public.gps_verification_history TO service_role;
ALTER TABLE public.gps_verification_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gps_hist_read" ON public.gps_verification_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "gps_hist_insert" ON public.gps_verification_history FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid());

CREATE TABLE public.gps_verification_overrides (
  id uuid primary key default gen_random_uuid(),
  loc_key text not null unique,
  submission_id text,
  community text default '',
  lat double precision,
  lng double precision,
  decision text not null check (decision in ('verified','corrected','rejected')),
  corrected_name text default '',
  note text default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gps_verification_overrides TO authenticated;
GRANT ALL ON public.gps_verification_overrides TO service_role;
ALTER TABLE public.gps_verification_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gps_ovr_read" ON public.gps_verification_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "gps_ovr_write" ON public.gps_verification_overrides FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND reviewed_by = auth.uid());
CREATE POLICY "gps_ovr_update" ON public.gps_verification_overrides FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "gps_ovr_delete" ON public.gps_verification_overrides FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_gps_ovr_updated BEFORE UPDATE ON public.gps_verification_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();