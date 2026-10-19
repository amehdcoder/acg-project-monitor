-- API keys, webhook endpoints, deliveries, and event queue for external/donor integrations.
-- Delivery is wake-on-enqueue (trigger wakes the dispatcher immediately); an hourly cron is only a retry backstop.

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['records:read'],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project admins manage api keys" ON public.api_keys FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid()) OR created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = api_keys.project_id AND p.created_by = auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = api_keys.project_id AND p.created_by = auth.uid()));

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  description text,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['beneficiary.created'],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project admins manage webhooks" ON public.webhook_endpoints FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid()) OR created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = webhook_endpoints.project_id AND p.created_by = auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = webhook_endpoints.project_id AND p.created_by = auth.uid()));

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project admins read events" ON public.webhook_events FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = webhook_events.project_id AND p.created_by = auth.uid()));

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  event text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  http_status integer,
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  response_snippet text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
GRANT SELECT, UPDATE ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project admins read deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webhook_endpoints e WHERE e.id = webhook_deliveries.endpoint_id
    AND (is_admin(auth.uid()) OR is_owner_or_co_owner(auth.uid())
         OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = e.project_id AND p.created_by = auth.uid()))));

-- Wake the dispatcher edge function, reusing the existing worker-secret header from the
-- health-exchange cron job so no credential is stored in this migration.
CREATE OR REPLACE FUNCTION public.wake_webhook_dispatcher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing text; hdrs jsonb;
BEGIN
  SELECT command INTO existing FROM cron.job WHERE jobname = 'health-exchange-monthly-dhis2' LIMIT 1;
  IF existing IS NULL THEN RETURN; END IF;
  hdrs := (substring(existing from 'headers:=''([^'']+)'''))::jsonb;
  PERFORM net.http_post(
    url := 'https://vhuixgcjmrmfowzrulac.supabase.co/functions/v1/webhook-dispatch',
    headers := hdrs,
    body := '{"source":"enqueue"}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wake_webhook_dispatcher() FROM anon, authenticated;

-- Event emission helper: queue the event, then wake the dispatcher immediately.
CREATE OR REPLACE FUNCTION public.emit_webhook_event(_project_id uuid, _event text, _payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.webhook_events (project_id, event, payload) VALUES (_project_id, _event, _payload);
  PERFORM public.wake_webhook_dispatcher();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_webhook_event(uuid, text, jsonb) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_emit_beneficiary_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE evt text;
BEGIN
  evt := CASE WHEN TG_OP = 'INSERT' THEN 'beneficiary.created' ELSE 'beneficiary.updated' END;
  PERFORM public.emit_webhook_event(NEW.project_id, evt, jsonb_build_object(
    'case_id', NEW.case_id, 'beneficiary_id', NEW.id, 'full_name', NEW.full_name,
    'status', NEW.status, 'state', NEW.state, 'lga', NEW.lga, 'ward', NEW.ward,
    'profile', NEW.profile, 'updated_at', NEW.updated_at));
  RETURN NEW;
END;
$$;
CREATE TRIGGER beneficiary_webhook_event AFTER INSERT OR UPDATE ON public.beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.trg_emit_beneficiary_event();

CREATE OR REPLACE FUNCTION public.trg_emit_service_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(NEW.project_id, 'service.recorded', jsonb_build_object(
    'beneficiary_id', NEW.beneficiary_id, 'service_id', NEW.id,
    'component_key', NEW.component_key, 'service_name', NEW.service_name,
    'service_date', NEW.service_date, 'result', NEW.result, 'status', NEW.status));
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_webhook_event AFTER INSERT ON public.beneficiary_services
  FOR EACH ROW EXECUTE FUNCTION public.trg_emit_service_event();

CREATE OR REPLACE FUNCTION public.trg_emit_feedback_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(NEW.project_id, 'feedback.submitted', jsonb_build_object(
    'reference', NEW.reference, 'category', NEW.category, 'severity', NEW.severity,
    'state', NEW.state, 'lga', NEW.lga, 'ward', NEW.ward, 'is_anonymous', NEW.is_anonymous));
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_webhook_event AFTER INSERT ON public.project_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_emit_feedback_event();

CREATE OR REPLACE FUNCTION public.trg_emit_report_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_webhook_event(NEW.project_id, 'programme_report.submitted', jsonb_build_object(
    'report_id', NEW.id, 'period_label', NEW.period_label, 'report_year', NEW.report_year, 'status', NEW.status));
  RETURN NEW;
END;
$$;
CREATE TRIGGER report_webhook_event AFTER INSERT ON public.programme_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_emit_report_event();

CREATE OR REPLACE FUNCTION public.trg_emit_home_visit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visited_at IS NOT NULL AND OLD.visited_at IS NULL THEN
    PERFORM public.emit_webhook_event(NEW.project_id, 'home_visit.reported', jsonb_build_object(
      'visit_id', NEW.id, 'beneficiary_id', NEW.beneficiary_id, 'visited_at', NEW.visited_at, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER home_visit_webhook_event AFTER UPDATE ON public.beneficiary_home_visits
  FOR EACH ROW EXECUTE FUNCTION public.trg_emit_home_visit_event();

REVOKE EXECUTE ON FUNCTION public.trg_emit_beneficiary_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_emit_service_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_emit_feedback_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_emit_report_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_emit_home_visit_event() FROM anon, authenticated;

-- API key validation for the external-api edge function (service role only)
CREATE OR REPLACE FUNCTION public.validate_api_key(_key_hash text)
RETURNS TABLE(key_id uuid, project_id uuid, scopes text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.api_keys SET last_used_at = now()
  WHERE key_hash = _key_hash AND is_active AND revoked_at IS NULL
  RETURNING id, api_keys.project_id, api_keys.scopes;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_api_key(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(text) TO service_role;

-- Hourly retry backstop for failed deliveries (24 runs/day; first delivery is instant via wake-on-enqueue).
SELECT cron.schedule('webhook-dispatch-retry-hourly', '7 * * * *', $$SELECT public.wake_webhook_dispatcher();$$);