
CREATE POLICY "Editors read dashboard uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dashboard-uploads' AND public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors write dashboard uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dashboard-uploads' AND public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors update dashboard uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dashboard-uploads' AND public.can_edit_dashboards(auth.uid()));

CREATE POLICY "Editors delete dashboard uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dashboard-uploads' AND public.can_edit_dashboards(auth.uid()));
