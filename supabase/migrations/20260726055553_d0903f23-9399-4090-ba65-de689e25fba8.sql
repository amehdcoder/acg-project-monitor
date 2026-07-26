
-- 1) Owner / super_admin / systems_admin delete policy
DROP POLICY IF EXISTS "Owners and super admins can delete microplan entries" ON public.microplan_entries;
CREATE POLICY "Owners and super admins can delete microplan entries"
ON public.microplan_entries FOR DELETE TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'systems_admin')
);

-- 2) Cleanup stuck Nayinawa entries under the Accelerate project
DELETE FROM public.microplan_entries
WHERE id IN (
  'de3726a1-be64-44a2-9455-5b01cddfe052',
  '6442703a-8de3-47fa-be93-accffab00647'
);

-- 3) Kobo integration columns
ALTER TABLE public.microplan_entries
  ADD COLUMN IF NOT EXISTS is_custom_location BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS microplan_entries_idempotency_key_uidx
  ON public.microplan_entries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4) Webhook event log
CREATE TABLE IF NOT EXISTS public.kobo_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'kobotoolbox',
  kobo_uuid TEXT,
  submitted_by_kobo TEXT,
  submitted_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  matched_entry_id UUID REFERENCES public.microplan_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kobo_webhook_events TO authenticated;
GRANT ALL ON public.kobo_webhook_events TO service_role;

ALTER TABLE public.kobo_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kobo webhook events" ON public.kobo_webhook_events;
CREATE POLICY "Admins can view kobo webhook events"
ON public.kobo_webhook_events FOR SELECT TO authenticated
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'systems_admin')
);

CREATE INDEX IF NOT EXISTS kobo_webhook_events_created_at_idx
  ON public.kobo_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS kobo_webhook_events_kobo_uuid_idx
  ON public.kobo_webhook_events (kobo_uuid);
