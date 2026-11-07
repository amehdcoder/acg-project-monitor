ALTER TABLE public.lqas_rounds ADD COLUMN IF NOT EXISTS indicator text, ADD COLUMN IF NOT EXISTS eligibility text, ADD COLUMN IF NOT EXISTS campaign_reference text, ADD COLUMN IF NOT EXISTS sampling_snapshot jsonb;
ALTER TABLE public.lqas_results ADD COLUMN IF NOT EXISTS collection_date date;
CREATE OR REPLACE FUNCTION public.lqas_validate_result() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE rd public.lqas_rounds; lid uuid;
BEGIN
 IF NEW.sampled < 1 OR NEW.covered < 0 OR NEW.covered > NEW.sampled THEN RAISE EXCEPTION 'Invalid LQAS sample counts'; END IF;
 IF (NEW.round_id IS NULL) <> (NEW.lot_id IS NULL) THEN RAISE EXCEPTION 'Both round and lot are required'; END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.lot_id IS DISTINCT FROM OLD.lot_id) THEN RAISE EXCEPTION 'Assessment linkage cannot be changed'; END IF;
 IF NEW.lot_id IS NOT NULL THEN
  SELECT r.* INTO rd FROM public.lqas_rounds r JOIN public.lqas_lots l ON l.round_id=r.id WHERE l.id=NEW.lot_id;
  IF rd.id IS NULL OR rd.id<>NEW.round_id OR rd.project_id<>NEW.project_id THEN RAISE EXCEPTION 'Round, lot and project do not match'; END IF;
  IF NEW.sampled > rd.sample_n THEN RAISE EXCEPTION 'Sample exceeds the approved round size'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lqas_validate_result BEFORE INSERT OR UPDATE ON public.lqas_results FOR EACH ROW EXECUTE FUNCTION public.lqas_validate_result();
CREATE OR REPLACE FUNCTION public.lqas_apply_lot_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.lqas_results; rd public.lqas_rounds; lid uuid; valid boolean; pass boolean; total int; done int;
BEGIN
 lid := CASE WHEN TG_OP='DELETE' THEN OLD.lot_id ELSE NEW.lot_id END;
 IF lid IS NULL THEN RETURN NULL; END IF;
 SELECT rr.* INTO rd FROM public.lqas_rounds rr JOIN public.lqas_lots l ON l.round_id=rr.id WHERE l.id=lid FOR UPDATE OF rr;
 IF rd.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.lqas_results WHERE lot_id=lid AND round_id=rd.id AND project_id=rd.project_id ORDER BY coalesce(collection_date::timestamptz, submitted_at, created_at) DESC, created_at DESC, id DESC LIMIT 1;
 valid := r.id IS NOT NULL AND r.sampled=rd.sample_n AND r.covered BETWEEN 0 AND r.sampled AND coalesce(r.payload->>'sampling_deviation','no')<>'yes';
 pass := valid AND r.covered>=rd.decision_rule;
 UPDATE public.lqas_lots SET covered_count=r.covered, sampled_count=r.sampled,
 status=CASE WHEN r.id IS NULL THEN 'Not Started' WHEN NOT valid THEN 'In Progress' WHEN pass THEN 'PASS' ELSE 'FAIL' END,
 mop_up_required=valid AND NOT pass, result_at=coalesce(r.collection_date::timestamptz,r.submitted_at,r.created_at),
 mop_up_due=CASE WHEN valid AND NOT pass THEN (coalesce(r.collection_date,r.submitted_at::date,r.created_at::date)+7) ELSE NULL END,
 data_source=r.source WHERE id=lid;
 SELECT count(*),count(*) FILTER(WHERE status IN ('PASS','FAIL')) INTO total,done FROM public.lqas_lots WHERE round_id=rd.id;
 UPDATE public.lqas_rounds SET status=CASE WHEN total>0 AND done=total THEN 'Completed' WHEN done>0 OR r.id IS NOT NULL THEN 'Active' ELSE 'Planned' END WHERE id=rd.id;
 RETURN NULL;
END $$;
CREATE TRIGGER lqas_result_deleted AFTER DELETE ON public.lqas_results FOR EACH ROW EXECUTE FUNCTION public.lqas_apply_lot_result();
REVOKE ALL ON FUNCTION public.lqas_apply_lot_result() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lqas_validate_result() FROM PUBLIC,anon,authenticated;
COMMENT ON COLUMN public.lqas_rounds.sampling_snapshot IS 'Frozen sampling frame and PPS slots used by paper and Kobo exports.';