
-- Helper: project membership
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_project_assignments
    WHERE user_id = _user_id AND project_id = _project_id
  );
$$;

-- Helper: microplan entry read with cascade-style geographic scoping
CREATE OR REPLACE FUNCTION public.can_read_microplan_entry(
  _user_id uuid, _state text, _lga text, _ward text, _flhf text, _community text, _settlement text, _project_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- Must have some form of microplanning access first
    (
      public.can_access_microplanning(_user_id)
      OR public.is_project_member(_user_id, _project_id)
    )
    AND (
      -- Owners/admins see everything
      public.is_owner_or_co_owner(_user_id)
      OR public.is_admin(_user_id)
      -- Users without a geographic designation are unrestricted within their access
      OR NOT EXISTS (
        SELECT 1 FROM public.microplan_designation_assignments WHERE user_id = _user_id
      )
      -- Otherwise the entry must fall within their assigned geography
      OR public.user_has_microplan_scope(_user_id, _state, _lga, _ward, _flhf, _community, _settlement)
    );
$$;

-- ===== attendance_participants =====
DROP POLICY IF EXISTS "auth read participants" ON public.attendance_participants;
DROP POLICY IF EXISTS "auth update participants" ON public.attendance_participants;
CREATE POLICY "Read attendance participants" ON public.attendance_participants
  FOR SELECT TO authenticated
  USING (registered_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Update attendance participants" ON public.attendance_participants
  FOR UPDATE TO authenticated
  USING (registered_by = auth.uid() OR public.is_admin(auth.uid()));

-- ===== attendance_sessions =====
DROP POLICY IF EXISTS "auth read sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "auth update sessions" ON public.attendance_sessions;
CREATE POLICY "Read attendance sessions" ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Update attendance sessions" ON public.attendance_sessions
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- ===== attendance_records =====
DROP POLICY IF EXISTS "auth read records" ON public.attendance_records;
DROP POLICY IF EXISTS "auth update records" ON public.attendance_records;
CREATE POLICY "Read attendance records" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    marked_by = auth.uid() OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (s.created_by = auth.uid() OR public.is_project_member(auth.uid(), s.project_id))
    )
  );
CREATE POLICY "Update attendance records" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (marked_by = auth.uid() OR public.is_admin(auth.uid()));

-- ===== ces_capture_sessions =====
DROP POLICY IF EXISTS "Authenticated can view CES sessions" ON public.ces_capture_sessions;
CREATE POLICY "Read CES capture sessions" ON public.ces_capture_sessions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== ces_fenced_communities =====
DROP POLICY IF EXISTS "fenced: authenticated read" ON public.ces_fenced_communities;
CREATE POLICY "Read fenced communities" ON public.ces_fenced_communities
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== ces_households =====
DROP POLICY IF EXISTS "Authenticated can view CES households" ON public.ces_households;
CREATE POLICY "Read CES households" ON public.ces_households
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== ces_surveys =====
DROP POLICY IF EXISTS "CES surveys: authenticated read" ON public.ces_surveys;
CREATE POLICY "Read CES surveys" ON public.ces_surveys
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== ces_household_visits =====
DROP POLICY IF EXISTS "CES visits: authenticated read" ON public.ces_household_visits;
CREATE POLICY "Read CES household visits" ON public.ces_household_visits
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid() OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ces_surveys s
      WHERE s.id = ces_household_visits.survey_id
        AND (s.created_by = auth.uid() OR public.is_project_member(auth.uid(), s.project_id))
    )
  );

-- ===== ces_segments =====
DROP POLICY IF EXISTS "CES segments: authenticated read" ON public.ces_segments;
CREATE POLICY "Read CES segments" ON public.ces_segments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ces_surveys s
      WHERE s.id = ces_segments.survey_id
        AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), s.project_id))
    )
  );

-- ===== ces_mopup_assignments =====
DROP POLICY IF EXISTS "Authenticated view mopup" ON public.ces_mopup_assignments;
CREATE POLICY "Read CES mopup assignments" ON public.ces_mopup_assignments
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid() OR assigned_user_id = auth.uid() OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ces_surveys s
      WHERE s.id = ces_mopup_assignments.survey_id
        AND (s.created_by = auth.uid() OR public.is_project_member(auth.uid(), s.project_id))
    )
  );

-- ===== health_facilities =====
DROP POLICY IF EXISTS "Authenticated can view facilities" ON public.health_facilities;
CREATE POLICY "Read health facilities" ON public.health_facilities
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== mesh_sync_relays =====
DROP POLICY IF EXISTS "Anyone authenticated can view relays" ON public.mesh_sync_relays;
CREATE POLICY "Read mesh sync relays" ON public.mesh_sync_relays
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ===== microplan_entries (geo-scoped read) =====
DROP POLICY IF EXISTS "Field designations can view microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Form access users can view microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Granted admins can view microplan entries" ON public.microplan_entries;
DROP POLICY IF EXISTS "Project members can view microplan entries" ON public.microplan_entries;
CREATE POLICY "Read microplan entries (geo-scoped)" ON public.microplan_entries
  FOR SELECT TO authenticated
  USING (public.can_read_microplan_entry(auth.uid(), state, lga, ward, flhf_name, community_name, settlement_name, project_id));

-- ===== microplan_medicine_allocations =====
DROP POLICY IF EXISTS "Authenticated read medicine allocations" ON public.microplan_medicine_allocations;
CREATE POLICY "Read medicine allocations" ON public.microplan_medicine_allocations
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

-- ===== ntd_assessments (admin oversight) =====
CREATE POLICY "Admins can view NTD assessments" ON public.ntd_assessments
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));

-- ===== stock_movements =====
DROP POLICY IF EXISTS "Authenticated can view movements" ON public.stock_movements;
CREATE POLICY "Read stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    performed_by = auth.uid() OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.health_facilities f
      WHERE f.id = stock_movements.facility_id
        AND public.is_project_member(auth.uid(), f.project_id)
    )
  );

-- ===== stock_requests =====
DROP POLICY IF EXISTS "Authenticated can view stock requests" ON public.stock_requests;
CREATE POLICY "Read stock requests" ON public.stock_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid() OR approver_id = auth.uid() OR resolved_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.health_facilities f
      WHERE f.id = stock_requests.facility_id
        AND public.is_project_member(auth.uid(), f.project_id)
    )
  );

-- ===== workplan_activities (admin oversight) =====
CREATE POLICY "Admins can view workplan activities" ON public.workplan_activities
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner_or_co_owner(auth.uid()));
