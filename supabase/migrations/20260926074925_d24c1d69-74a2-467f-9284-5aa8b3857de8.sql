ALTER TABLE public.brain_models
  ADD COLUMN IF NOT EXISTS server_trained_at timestamptz,
  ADD COLUMN IF NOT EXISTS server_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS server_steps integer NOT NULL DEFAULT 0;

ALTER TABLE public.brain_flags
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'brain',
  ADD COLUMN IF NOT EXISTS flagged_by uuid,
  ADD COLUMN IF NOT EXISTS flag_note text;

-- Single-flight lease for the unattended 30-minute trainer.
CREATE OR REPLACE FUNCTION public.claim_brain_for_training(_min_steps integer, _limit integer)
RETURNS SETOF public.brain_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.brain_models bm SET server_lease_until = now() + interval '5 minutes'
  WHERE bm.brain_key IN (
    SELECT brain_key FROM public.brain_models
    WHERE steps >= _min_steps
      AND (server_lease_until IS NULL OR server_lease_until < now())
      AND (server_trained_at IS NULL OR server_trained_at < now() - interval '25 minutes')
    ORDER BY server_trained_at NULLS FIRST
    LIMIT _limit
    FOR UPDATE SKIP LOCKED)
  RETURNING bm.*;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_brain_for_training(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_brain_for_training(integer, integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;