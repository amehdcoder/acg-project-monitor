
ALTER TABLE public.beneficiaries ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL;
ALTER TABLE public.beneficiary_referrals ADD COLUMN IF NOT EXISTS from_facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL;
ALTER TABLE public.beneficiary_referrals ADD COLUMN IF NOT EXISTS to_facility_id uuid REFERENCES public.health_facilities(id) ON DELETE SET NULL;
ALTER TABLE public.beneficiary_referrals ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'routine';
ALTER TABLE public.beneficiary_referrals ADD COLUMN IF NOT EXISTS clinical_summary text;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_facility ON public.beneficiaries(facility_id);
CREATE INDEX IF NOT EXISTS idx_beneficiary_referrals_to_facility ON public.beneficiary_referrals(to_facility_id);

CREATE TABLE IF NOT EXISTS public.facility_focal_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'focal_person',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facility_focal_persons TO authenticated;
GRANT ALL ON public.facility_focal_persons TO service_role;

ALTER TABLE public.facility_focal_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Focal persons and admins read focal list"
  ON public.facility_focal_persons FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())) OR user_id = (SELECT auth.uid()));

CREATE POLICY "Admins manage focal persons insert"
  ON public.facility_focal_persons FOR INSERT TO authenticated
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY "Admins manage focal persons update"
  ON public.facility_focal_persons FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY "Admins manage focal persons delete"
  ON public.facility_focal_persons FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

CREATE TRIGGER update_facility_focal_persons_updated_at
  BEFORE UPDATE ON public.facility_focal_persons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_facility_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT facility_id FROM public.facility_focal_persons
  WHERE user_id = _user_id AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.is_facility_focal(_user_id uuid, _facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_focal_persons
    WHERE user_id = _user_id AND facility_id = _facility_id AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_facility_access_to_beneficiary(_user_id uuid, _beneficiary_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beneficiaries b
    WHERE b.id = _beneficiary_id
      AND b.facility_id IN (SELECT public.user_facility_ids(_user_id))
  ) OR EXISTS (
    SELECT 1 FROM public.beneficiary_referrals r
    WHERE r.beneficiary_id = _beneficiary_id
      AND r.to_facility_id IN (SELECT public.user_facility_ids(_user_id))
  )
$$;

CREATE POLICY "Facility focal persons view beneficiaries"
  ON public.beneficiaries FOR SELECT TO authenticated
  USING (public.has_facility_access_to_beneficiary((SELECT auth.uid()), id));

CREATE POLICY "Facility focal persons update beneficiaries"
  ON public.beneficiaries FOR UPDATE TO authenticated
  USING (facility_id IN (SELECT public.user_facility_ids((SELECT auth.uid()))))
  WITH CHECK (facility_id IN (SELECT public.user_facility_ids((SELECT auth.uid()))));

CREATE POLICY "Facility focal persons view services"
  ON public.beneficiary_services FOR SELECT TO authenticated
  USING (public.has_facility_access_to_beneficiary((SELECT auth.uid()), beneficiary_id));

CREATE POLICY "Facility focal persons record services"
  ON public.beneficiary_services FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = (SELECT auth.uid())
    AND public.has_facility_access_to_beneficiary((SELECT auth.uid()), beneficiary_id)
  );

CREATE POLICY "Facility focal persons view referrals"
  ON public.beneficiary_referrals FOR SELECT TO authenticated
  USING (public.has_facility_access_to_beneficiary((SELECT auth.uid()), beneficiary_id));

CREATE POLICY "Receiving facility updates referrals"
  ON public.beneficiary_referrals FOR UPDATE TO authenticated
  USING (to_facility_id IN (SELECT public.user_facility_ids((SELECT auth.uid()))))
  WITH CHECK (to_facility_id IN (SELECT public.user_facility_ids((SELECT auth.uid()))));

CREATE POLICY "Facility focal persons view beneficiary audit"
  ON public.beneficiary_audit FOR SELECT TO authenticated
  USING (public.has_facility_access_to_beneficiary((SELECT auth.uid()), beneficiary_id));
