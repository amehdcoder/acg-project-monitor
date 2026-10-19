
-- 1. Enrich the instant report webhook: include the full report (entries with
-- disaggregations and risks, plus a logframe snapshot) so donor systems receive
-- everything they need without calling back into the API.
CREATE OR REPLACE FUNCTION public.trg_emit_report_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  entries jsonb;
  logframe jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'indicator_code', e.indicator_code,
    'value', e.value,
    'disaggregation', e.disaggregation,
    'risk', e.risk,
    'over_target_comment', e.over_target_comment
  ) ORDER BY e.indicator_code), '[]'::jsonb)
  INTO entries
  FROM public.programme_report_entries e
  WHERE e.report_id = NEW.id;

  SELECT l.data INTO logframe
  FROM public.programme_logframes l
  WHERE l.project_id = NEW.project_id;

  PERFORM public.emit_webhook_event(NEW.project_id, 'programme_report.submitted', jsonb_build_object(
    'report_id', NEW.id,
    'period_label', NEW.period_label,
    'report_year', NEW.report_year,
    'status', NEW.status,
    'notes', NEW.notes,
    'submitted_at', NEW.created_at,
    'entries', entries,
    'logframe', logframe
  ));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_emit_report_event() FROM anon, authenticated;

-- 2. Monthly scheduled sync: on the 1st of each month, enqueue one
-- 'programme_report.monthly_sync' event per project that has an active webhook
-- endpoint subscribed to it (or '*'). The payload carries every report from the
-- previous calendar month plus running totals, so donor systems stay in sync even
-- when no new submission triggered an instant push.
CREATE OR REPLACE FUNCTION public.enqueue_monthly_report_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj RECORD;
  reports jsonb;
  totals jsonb;
  month_start timestamptz := date_trunc('month', now()) - interval '1 month';
  month_end timestamptz := date_trunc('month', now());
BEGIN
  FOR proj IN
    SELECT DISTINCT e.project_id
    FROM public.webhook_endpoints e
    WHERE e.is_active
      AND (e.events @> '["programme_report.monthly_sync"]'::jsonb OR e.events @> '["*"]'::jsonb)
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'report_id', r.id,
      'period_label', r.period_label,
      'report_year', r.report_year,
      'status', r.status,
      'notes', r.notes,
      'submitted_at', r.created_at,
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'indicator_code', en.indicator_code,
          'value', en.value,
          'disaggregation', en.disaggregation,
          'risk', en.risk
        ) ORDER BY en.indicator_code)
        FROM public.programme_report_entries en
        WHERE en.report_id = r.id
      ), '[]'::jsonb)
    ) ORDER BY r.created_at), '[]'::jsonb)
    INTO reports
    FROM public.programme_reports r
    WHERE r.project_id = proj.project_id
      AND r.created_at >= month_start AND r.created_at < month_end;

    SELECT jsonb_build_object(
      'total_beneficiaries', (SELECT count(*) FROM public.beneficiaries b WHERE b.project_id = proj.project_id),
      'services_last_month', (SELECT count(*) FROM public.beneficiary_services s WHERE s.project_id = proj.project_id AND s.created_at >= month_start AND s.created_at < month_end),
      'reports_last_month', jsonb_array_length(reports)
    ) INTO totals;

    PERFORM public.emit_webhook_event(proj.project_id, 'programme_report.monthly_sync', jsonb_build_object(
      'sync_month', to_char(month_start, 'YYYY-MM'),
      'reports', reports,
      'totals', totals
    ));
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_monthly_report_sync() FROM anon, authenticated;

-- Runs once a month: 06:05 UTC on the 1st (07:05 Lagos). The instant push on
-- submission remains the primary path; this is the safety-net re-sync.
SELECT cron.schedule('programme-report-monthly-sync', '5 6 1 * *', $$SELECT public.enqueue_monthly_report_sync();$$);
