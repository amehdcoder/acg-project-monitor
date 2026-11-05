CREATE OR REPLACE FUNCTION public.lqas_apply_lot_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.lqas_results; rd public.lqas_rounds; pass boolean; total int; done int;
BEGIN
  IF NEW.lot_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.lqas_results WHERE lot_id = NEW.lot_id
    ORDER BY coalesce(submitted_at, created_at) DESC, created_at DESC LIMIT 1;
  SELECT rd2.* INTO rd FROM public.lqas_rounds rd2 JOIN public.lqas_lots l ON l.round_id = rd2.id WHERE l.id = NEW.lot_id;
  IF rd.id IS NULL THEN RETURN NEW; END IF;
  pass := r.covered >= rd.decision_rule AND r.sampled >= rd.sample_n;
  UPDATE public.lqas_lots SET
    covered_count = r.covered, sampled_count = r.sampled,
    status = CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END,
    mop_up_required = NOT pass,
    result_at = coalesce(r.submitted_at, r.created_at),
    mop_up_due = CASE WHEN pass THEN NULL ELSE (coalesce(r.submitted_at, r.created_at)::date + 7) END,
    data_source = 'kobo'
  WHERE id = NEW.lot_id;
  SELECT count(*), count(*) FILTER (WHERE status IN ('PASS','FAIL')) INTO total, done FROM public.lqas_lots WHERE round_id = rd.id;
  UPDATE public.lqas_rounds SET status = CASE WHEN done >= total THEN 'Completed' ELSE 'Active' END WHERE id = rd.id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lqas_apply_lot_result() FROM PUBLIC, anon, authenticated;