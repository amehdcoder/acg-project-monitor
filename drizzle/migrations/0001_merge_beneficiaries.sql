CREATE OR REPLACE FUNCTION public.merge_beneficiaries(_keep uuid, _drop uuid, _profile jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k public.beneficiaries; d public.beneficiaries;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators can merge records'; END IF;
  IF _keep = _drop THEN RAISE EXCEPTION 'Choose two different records'; END IF;
  SELECT * INTO k FROM public.beneficiaries WHERE id = _keep;
  SELECT * INTO d FROM public.beneficiaries WHERE id = _drop;
  IF k.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF k.module_id <> d.module_id THEN RAISE EXCEPTION 'Records belong to different registers'; END IF;

  UPDATE public.beneficiary_services SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.beneficiary_referrals SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.beneficiary_home_visits SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.beneficiary_lesion_assessments SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.ntd_morbidity_records SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.safeguarding_concerns SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.mmdp_potential_cases SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.household_members SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.beneficiary_audit SET beneficiary_id = _keep WHERE beneficiary_id = _drop;
  UPDATE public.brain_flags SET beneficiary_id = _keep WHERE beneficiary_id = _drop;

  UPDATE public.beneficiaries SET
    profile = COALESCE(_profile, d.profile || k.profile),
    photo_url = COALESCE(k.photo_url, d.photo_url),
    latitude = COALESCE(k.latitude, d.latitude), longitude = COALESCE(k.longitude, d.longitude),
    state = COALESCE(k.state, d.state), lga = COALESCE(k.lga, d.lga),
    ward = COALESCE(k.ward, d.ward), village = COALESCE(k.village, d.village),
    next_follow_up_date = COALESCE(k.next_follow_up_date, d.next_follow_up_date),
    updated_at = now()
  WHERE id = _keep;

  INSERT INTO public.beneficiary_audit (beneficiary_id, action, actor_id, details)
  VALUES (_keep, 'merged', auth.uid(), jsonb_build_object('merged_case_id', d.case_id, 'merged_id', d.id, 'merged_name', d.full_name));

  DELETE FROM public.beneficiaries WHERE id = _drop;
END $$;
REVOKE ALL ON FUNCTION public.merge_beneficiaries(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_beneficiaries(uuid, uuid, jsonb) TO authenticated;