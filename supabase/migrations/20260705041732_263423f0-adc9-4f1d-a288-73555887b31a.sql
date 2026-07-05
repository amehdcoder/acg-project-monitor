
-- 1. bloomberg_schools: require a cascade assignment (or admin/owner) before unrestricted fallback
DROP POLICY IF EXISTS "Cascade scoped read schools" ON public.bloomberg_schools;
CREATE POLICY "Cascade scoped read schools"
ON public.bloomberg_schools
FOR SELECT
USING (
  public.is_owner_or_co_owner(auth.uid())
  OR public.is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM public.user_cascade_assignments uca
      WHERE uca.user_id = auth.uid() AND uca.form_id = 'bloomberg_enrolment'
    )
    AND public.user_cascade_allows(
      auth.uid(),
      'bloomberg_enrolment'::text,
      jsonb_build_object('state', state, 'lga', lga, 'ward', ward, 'location', location, 'school_key', school_key)
    )
  )
);

-- 2. ntd_assessments: limit beneficiary PII to top-level admins/owners only
DROP POLICY IF EXISTS "Admins can view NTD assessments" ON public.ntd_assessments;
CREATE POLICY "Admins can view NTD assessments"
ON public.ntd_assessments
FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.is_owner_or_co_owner(auth.uid())
);

-- 3. profiles: explicit INSERT policy preventing privilege escalation
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE(is_owner, false) = false
  AND COALESCE(is_co_owner, false) = false
);

-- 4. uprp_submissions: allow admins and co-owners oversight read access
DROP POLICY IF EXISTS "Users view own uprp submissions" ON public.uprp_submissions;
CREATE POLICY "Users view own uprp submissions"
ON public.uprp_submissions
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.is_owner_or_co_owner(auth.uid())
);

-- 5. workplan_activities: limit responsible_email PII exposure to owners/co-owners
DROP POLICY IF EXISTS "Admins can view workplan activities" ON public.workplan_activities;
CREATE POLICY "Admins can view workplan activities"
ON public.workplan_activities
FOR SELECT
USING (
  public.is_owner_or_co_owner(auth.uid())
);
