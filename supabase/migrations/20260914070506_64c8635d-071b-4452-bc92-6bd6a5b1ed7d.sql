ALTER TABLE public.beneficiary_referrals
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_beneficiary_referrals_from_status
  ON public.beneficiary_referrals (from_facility_id, status);

CREATE OR REPLACE FUNCTION public.accept_beneficiary_referral(_referral_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.beneficiary_referrals%ROWTYPE;
  _uid uuid := (SELECT auth.uid());
  _old_facility uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO r FROM public.beneficiary_referrals WHERE id = _referral_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found.';
  END IF;
  IF r.to_facility_id IS NULL THEN
    RAISE EXCEPTION 'This referral has no receiving facility.';
  END IF;

  IF NOT (
    public.can_record_at_facility(_uid, r.to_facility_id)
    OR public.can_manage_at_facility(_uid, r.to_facility_id)
    OR public.is_admin(_uid)
  ) THEN
    RAISE EXCEPTION 'You are not allowed to accept referrals at this facility.';
  END IF;

  SELECT facility_id INTO _old_facility FROM public.beneficiaries WHERE id = r.beneficiary_id;

  UPDATE public.beneficiary_referrals
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by = _uid,
         transferred_at = now(),
         from_facility_id = COALESCE(from_facility_id, _old_facility),
         updated_at = now()
   WHERE id = _referral_id;

  UPDATE public.beneficiaries
     SET facility_id = r.to_facility_id,
         updated_at = now()
   WHERE id = r.beneficiary_id;

  INSERT INTO public.beneficiary_audit (beneficiary_id, project_id, action, field_name, old_value, new_value, actor_id)
  VALUES (r.beneficiary_id, r.project_id, 'referral_accepted', 'facility_id',
          _old_facility::text, r.to_facility_id::text, _uid);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_beneficiary_referral(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_beneficiary_referral(uuid) TO authenticated;