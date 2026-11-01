CREATE TABLE public.eye_visual_trajectories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 episode_key text NOT NULL CHECK(length(episode_key) BETWEEN 1 AND 150), facility_name text NOT NULL CHECK(length(facility_name) BETWEEN 1 AND 200), lga text NOT NULL CHECK(length(lga) BETWEEN 1 AND 80), surgery_date date NOT NULL,
 baseline numeric NOT NULL CHECK(baseline BETWEEN -0.3 AND 3), day30 numeric CHECK(day30 BETWEEN -0.3 AND 3), day90 numeric CHECK(day90 BETWEEN -0.3 AND 3), day180 numeric CHECK(day180 BETWEEN -0.3 AND 3),
 source text NOT NULL DEFAULT 'tracker_import' CHECK(source IN ('tracker_import','clinical_entry')), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,episode_key)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.eye_visual_trajectories TO authenticated;
GRANT ALL ON public.eye_visual_trajectories TO service_role;
ALTER TABLE public.eye_visual_trajectories ENABLE ROW LEVEL SECURITY;
CREATE POLICY eye_trajectory_read ON public.eye_visual_trajectories FOR SELECT TO authenticated USING(public.can_view_eye_dashboard(auth.uid(),project_id) OR (created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id)));
CREATE POLICY eye_trajectory_insert ON public.eye_visual_trajectories FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE POLICY eye_trajectory_update ON public.eye_visual_trajectories FOR UPDATE TO authenticated USING(created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id)) WITH CHECK(created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE POLICY eye_trajectory_delete ON public.eye_visual_trajectories FOR DELETE TO authenticated USING(created_by=auth.uid() AND public.can_eye_report(auth.uid(),project_id));
CREATE INDEX eye_trajectory_project_date ON public.eye_visual_trajectories(project_id,surgery_date);
COMMENT ON TABLE public.eye_visual_trajectories IS 'Pseudonymous per-eye surgical episodes with measured logMAR baseline and postoperative milestones; no inferred values or joins by patient display name.';