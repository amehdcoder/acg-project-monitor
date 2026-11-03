CREATE TABLE public.eye_who_deleted_surveys (id uuid PRIMARY KEY, project_id uuid NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.eye_who_deleted_surveys TO authenticated;
GRANT ALL ON public.eye_who_deleted_surveys TO service_role;
ALTER TABLE public.eye_who_deleted_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read permitted survey deletion guards" ON public.eye_who_deleted_surveys FOR SELECT TO authenticated USING (public.can_view_eye_dashboard(auth.uid(),project_id) OR public.can_eye_report(auth.uid(),project_id));
DROP POLICY "Delete own permitted surveys" ON public.eye_who_surveys;
CREATE POLICY "Super admins delete survey evidence" ON public.eye_who_surveys FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin') AND public.can_view_eye_dashboard(auth.uid(),project_id));
CREATE FUNCTION public.guard_eye_who_survey_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO public.eye_who_deleted_surveys(id,project_id) VALUES(OLD.id,OLD.project_id) ON CONFLICT(id) DO NOTHING;
  RETURN OLD;
 END IF;
 IF EXISTS (SELECT 1 FROM public.eye_who_deleted_surveys WHERE id=NEW.id) THEN RAISE EXCEPTION 'This survey was deleted and cannot be restored by an offline replay'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_eye_who_survey_deletion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER eye_who_delete_guard AFTER DELETE ON public.eye_who_surveys FOR EACH ROW EXECUTE FUNCTION public.guard_eye_who_survey_deletion();
CREATE TRIGGER eye_who_replay_guard BEFORE INSERT OR UPDATE ON public.eye_who_surveys FOR EACH ROW EXECUTE FUNCTION public.guard_eye_who_survey_deletion();
CREATE FUNCTION public.delete_eye_who_surveys(_project uuid, _ids uuid[] DEFAULT NULL) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deleted uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') OR NOT public.can_view_eye_dashboard(auth.uid(),_project) THEN RAISE EXCEPTION 'Only a Super Admin with project dashboard access can clear survey evidence' USING ERRCODE='42501'; END IF;
 WITH removed AS (DELETE FROM public.eye_who_surveys WHERE project_id=_project AND (_ids IS NULL OR id=ANY(_ids)) RETURNING id) SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO deleted FROM removed;
 RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION public.delete_eye_who_surveys(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_eye_who_surveys(uuid,uuid[]) TO authenticated,service_role;