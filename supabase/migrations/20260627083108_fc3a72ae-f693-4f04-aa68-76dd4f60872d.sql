-- 1. OAuth state nonce table (anti-forgery for Google OAuth callback)
CREATE TABLE IF NOT EXISTS public.oauth_state_nonces (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
GRANT ALL ON public.oauth_state_nonces TO service_role;
ALTER TABLE public.oauth_state_nonces ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) may read/write nonces.

-- 2. Tighten ces_feature_labels SELECT to survey owner / admin / project member
DROP POLICY IF EXISTS "CES feature labels: survey viewers can view" ON public.ces_feature_labels;
CREATE POLICY "CES feature labels: survey viewers can view"
ON public.ces_feature_labels
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ces_surveys s
    WHERE s.id = ces_feature_labels.survey_id
      AND (
        s.created_by = auth.uid()
        OR public.is_admin(auth.uid())
        OR public.is_project_member(auth.uid(), s.project_id)
      )
  )
);

-- 3. Restrict ces_gap_clusters writes to admins or project members
DROP POLICY IF EXISTS "Authenticated insert gap clusters" ON public.ces_gap_clusters;
DROP POLICY IF EXISTS "Authenticated update gap clusters" ON public.ces_gap_clusters;
CREATE POLICY "Project members or admins insert gap clusters"
ON public.ces_gap_clusters
FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_project_member(auth.uid(), project_id)
);
CREATE POLICY "Project members or admins update gap clusters"
ON public.ces_gap_clusters
FOR UPDATE
USING (
  public.is_admin(auth.uid())
  OR public.is_project_member(auth.uid(), project_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_project_member(auth.uid(), project_id)
);

-- 4. Add admin/owner SELECT policy on workplans (consistent with workplan_activities)
CREATE POLICY "Admins and owners can view all workplans"
ON public.workplans
FOR SELECT
USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));