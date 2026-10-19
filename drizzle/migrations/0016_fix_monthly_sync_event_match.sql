
-- events is text[], not jsonb: match subscriptions with ANY() instead of @>.
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
      AND ('programme_report.monthly_sync' = ANY(e.events) OR '*' = ANY(e.events))
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
