
-- acsm_reports
DROP POLICY IF EXISTS "Authenticated can view ACSM reports" ON public.acsm_reports;
CREATE POLICY "Creator, project members or admins view ACSM reports"
ON public.acsm_reports FOR SELECT
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- sbc_reports
DROP POLICY IF EXISTS "Authenticated users can view all SBC reports" ON public.sbc_reports;
CREATE POLICY "Creator, project members or admins view SBC reports"
ON public.sbc_reports FOR SELECT
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- antidepressant_stock
DROP POLICY IF EXISTS "Authenticated can view stock" ON public.antidepressant_stock;
DROP POLICY IF EXISTS "Authenticated can update stock" ON public.antidepressant_stock;
CREATE POLICY "Creator, project members or admins view stock"
ON public.antidepressant_stock FOR SELECT
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);
CREATE POLICY "Creator, project members or admins update stock"
ON public.antidepressant_stock FOR UPDATE
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
)
WITH CHECK (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- ces_gap_clusters
DROP POLICY IF EXISTS "Authenticated users can view gap clusters" ON public.ces_gap_clusters;
CREATE POLICY "Project members, survey creators or admins view gap clusters"
ON public.ces_gap_clusters FOR SELECT
USING (
  is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
  OR EXISTS (
    SELECT 1 FROM public.ces_surveys s
    WHERE s.id = ces_gap_clusters.survey_id
      AND s.created_by = auth.uid()
  )
);

-- meeting_action_points
DROP POLICY IF EXISTS "Staff can view action points" ON public.meeting_action_points;
DROP POLICY IF EXISTS "Staff can update action points" ON public.meeting_action_points;
CREATE POLICY "Creator, project members or admins view action points"
ON public.meeting_action_points FOR SELECT
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);
CREATE POLICY "Creator, project members or admins update action points"
ON public.meeting_action_points FOR UPDATE
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
)
WITH CHECK (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- Storage: ces-captures (private bucket) restrict reads
DROP POLICY IF EXISTS "Authenticated can view CES capture files" ON storage.objects;
CREATE POLICY "Owner or admins view CES capture files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ces-captures'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR is_admin(auth.uid())
  )
);

-- Storage: uprp-uploads restrict reads
DROP POLICY IF EXISTS "uprp uploads publicly readable" ON storage.objects;
CREATE POLICY "Owner or admins view uprp uploads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'uprp-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR is_admin(auth.uid())
  )
);
