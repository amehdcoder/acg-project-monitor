CREATE OR REPLACE FUNCTION public.trg_emit_report_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Entries are saved in the next request; do not send an incomplete header.
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emit_report_event() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_emit_complete_report_entries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT report_id FROM inserted_entries LOOP
    PERFORM public.emit_webhook_event(p.project_id, 'programme_report.submitted', jsonb_build_object(
      'report_id', p.id, 'period_label', p.period_label, 'report_year', p.report_year,
      'status', p.status, 'notes', p.notes, 'submitted_at', p.created_at,
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'indicator_code', e.indicator_code, 'value', e.value,
        'disaggregation', e.disaggregation, 'risk', e.risk,
        'over_target_comment', e.over_target_comment
      ) ORDER BY e.indicator_code) FROM public.programme_report_entries e WHERE e.report_id = p.id), '[]'::jsonb),
      'logframe', (SELECT l.data FROM public.programme_logframes l WHERE l.project_id = p.project_id)
    )) FROM public.programme_reports p WHERE p.id = r.report_id;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emit_complete_report_entries() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER complete_report_entries_webhook AFTER INSERT ON public.programme_report_entries
REFERENCING NEW TABLE AS inserted_entries FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_emit_complete_report_entries();