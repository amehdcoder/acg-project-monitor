CREATE OR REPLACE FUNCTION public.lqas_validate_round_design() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k int; j int; d int:=0; cdf double precision; term double precision; p double precision; beta double precision;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.sample_n IS DISTINCT FROM OLD.sample_n OR NEW.upper_threshold IS DISTINCT FROM OLD.upper_threshold OR NEW.lower_threshold IS DISTINCT FROM OLD.lower_threshold OR NEW.decision_rule IS DISTINCT FROM OLD.decision_rule OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.eu_key IS DISTINCT FROM OLD.eu_key OR (OLD.sampling_snapshot IS NOT NULL AND (NEW.sampling_snapshot IS DISTINCT FROM OLD.sampling_snapshot OR NEW.indicator IS DISTINCT FROM OLD.indicator OR NEW.eligibility IS DISTINCT FROM OLD.eligibility OR NEW.campaign_reference IS DISTINCT FROM OLD.campaign_reference))) THEN RAISE EXCEPTION 'Saved survey design and sampling frame are immutable; create a new round'; END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 IF NEW.sample_n NOT BETWEEN 10 AND 30 OR NEW.lower_threshold<0 OR NEW.upper_threshold>100 OR NEW.lower_threshold>=NEW.upper_threshold THEN RAISE EXCEPTION 'Invalid LQAS design'; END IF;
 p:=NEW.upper_threshold/100.0;
 FOR k IN 1..NEW.sample_n LOOP
  cdf:=0;
  FOR j IN 0..k-1 LOOP
   term:=1;
   IF j>0 THEN FOR i IN 1..j LOOP term:=term*(NEW.sample_n-i+1)/i; END LOOP; END IF;
   cdf:=cdf+term*power(p,j)*power(1-p,NEW.sample_n-j);
  END LOOP;
  IF cdf<=0.1+1e-10 THEN d:=k; ELSE EXIT; END IF;
 END LOOP;
 p:=NEW.lower_threshold/100.0; cdf:=0;
 IF d>0 THEN FOR j IN 0..d-1 LOOP
  term:=1; IF j>0 THEN FOR i IN 1..j LOOP term:=term*(NEW.sample_n-i+1)/i; END LOOP; END IF;
  cdf:=cdf+term*power(p,j)*power(1-p,NEW.sample_n-j);
 END LOOP; END IF;
 beta:=1-cdf;
 IF d<1 OR NEW.decision_rule<>d OR beta>0.1+1e-10 THEN RAISE EXCEPTION 'Design must use the computed pass mark and satisfy both 10 percent error limits'; END IF;
 IF nullif(trim(NEW.indicator),'') IS NULL OR nullif(trim(NEW.eligibility),'') IS NULL OR nullif(trim(NEW.campaign_reference),'') IS NULL OR NEW.sampling_snapshot IS NULL OR jsonb_typeof(NEW.sampling_snapshot)<>'array' THEN RAISE EXCEPTION 'Save indicator, eligibility, campaign and frozen sampling frame'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lqas_validate_round_design BEFORE INSERT OR UPDATE ON public.lqas_rounds FOR EACH ROW EXECUTE FUNCTION public.lqas_validate_round_design();
REVOKE ALL ON FUNCTION public.lqas_validate_round_design() FROM PUBLIC,anon,authenticated;