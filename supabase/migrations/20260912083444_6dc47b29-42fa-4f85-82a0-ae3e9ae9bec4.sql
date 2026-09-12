ALTER TABLE public.beneficiary_referrals
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS followup_date date,
  ADD COLUMN IF NOT EXISTS followup_time text,
  ADD COLUMN IF NOT EXISTS followup_location text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_referrals_to_facility_followup
  ON public.beneficiary_referrals (to_facility_id, followup_date);

CREATE OR REPLACE FUNCTION public.facility_access_level_for(_user_id uuid, _facility_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT access_level
  FROM public.facility_focal_persons
  WHERE facility_id = _facility_id
    AND user_id = _user_id
    AND is_active
  ORDER BY CASE access_level WHEN 'manage' THEN 1 WHEN 'record' THEN 2 ELSE 3 END
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.facility_access_level_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facility_access_level_for(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_record_at_facility(_user_id uuid, _facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.facility_access_level_for(_user_id, _facility_id) IN ('record','manage')
$$;

REVOKE ALL ON FUNCTION public.can_record_at_facility(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_at_facility(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_at_facility(_user_id uuid, _facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.facility_access_level_for(_user_id, _facility_id) = 'manage'
$$;

REVOKE ALL ON FUNCTION public.can_manage_at_facility(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_at_facility(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Facility focal persons update beneficiaries" ON public.beneficiaries;
CREATE POLICY "Facility focal persons update beneficiaries"
ON public.beneficiaries FOR UPDATE TO authenticated
USING (public.can_manage_at_facility((SELECT auth.uid()), facility_id))
WITH CHECK (public.can_manage_at_facility((SELECT auth.uid()), facility_id));

DROP POLICY IF EXISTS "Receiving facility updates referrals" ON public.beneficiary_referrals;
CREATE POLICY "Facility focal persons update referrals"
ON public.beneficiary_referrals FOR UPDATE TO authenticated
USING (
  public.can_record_at_facility((SELECT auth.uid()), to_facility_id)
  OR public.can_record_at_facility((SELECT auth.uid()), from_facility_id)
)
WITH CHECK (
  public.can_record_at_facility((SELECT auth.uid()), to_facility_id)
  OR public.can_record_at_facility((SELECT auth.uid()), from_facility_id)
);

DROP POLICY IF EXISTS "Admins create delete requests" ON public.beneficiary_delete_requests;
CREATE POLICY "Admins and facility managers create delete requests"
ON public.beneficiary_delete_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = (SELECT auth.uid())
  AND (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.beneficiaries b
      WHERE b.id = beneficiary_id
        AND public.can_manage_at_facility((SELECT auth.uid()), b.facility_id)
    )
  )
);