
-- 1) Missing columns referenced by the offline-sync writer + workflow.
ALTER TABLE public.ces_household_visits
  ADD COLUMN IF NOT EXISTS duplicate_reason text,
  ADD COLUMN IF NOT EXISTS evidence_hash    text,
  ADD COLUMN IF NOT EXISTS gps_snapshot     jsonb,
  ADD COLUMN IF NOT EXISTS segment_label    text;

-- 2) Make household visits immutable for non-admins.
DROP POLICY IF EXISTS "CES visits: creator or admin update" ON public.ces_household_visits;
DROP POLICY IF EXISTS "CES visits: creator or admin delete" ON public.ces_household_visits;

CREATE POLICY "CES visits: admin-only update"
  ON public.ces_household_visits
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "CES visits: admin-only delete"
  ON public.ces_household_visits
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 3) Owners may peer-validate surveys they themselves created.
CREATE OR REPLACE FUNCTION public.can_peer_validate_survey(_user_id uuid, _survey_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ces_surveys s
    WHERE s.id = _survey_id
      AND (
        public.is_owner(_user_id)
        OR (
          s.created_by <> _user_id
          AND (
            public.is_admin(_user_id)
            OR public.has_ces_role(_user_id, s.project_id, 'peer_validator')
          )
        )
      )
  );
$function$;
