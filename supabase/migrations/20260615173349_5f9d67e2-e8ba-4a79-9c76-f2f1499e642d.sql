
-- Generic cascade-scope check. _fields is a jsonb map of cascade field_key -> row value.
CREATE OR REPLACE FUNCTION public.user_cascade_allows(_user_id uuid, _form_id text, _fields jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_owner_or_co_owner(_user_id)
    OR public.is_admin(_user_id)
    -- No cascade assignment for this form => unrestricted.
    OR NOT EXISTS (
      SELECT 1 FROM public.user_cascade_assignments
      WHERE user_id = _user_id AND form_id = _form_id
    )
    -- Restricted: for every assigned field, the row value must match one of the
    -- user's allowed values for that field.
    OR NOT EXISTS (
      SELECT 1
      FROM (
        SELECT DISTINCT field_key
        FROM public.user_cascade_assignments
        WHERE user_id = _user_id AND form_id = _form_id
      ) fk
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_cascade_assignments uca
        WHERE uca.user_id = _user_id
          AND uca.form_id = _form_id
          AND uca.field_key = fk.field_key
          AND uca.value = (_fields ->> fk.field_key)
      )
    )
$$;

-- Owner / Co-owner can delete ANY validation entry.
CREATE POLICY "Owner level delete validations"
  ON public.bloomberg_validations FOR DELETE
  TO authenticated
  USING (public.is_owner_or_co_owner(auth.uid()));

-- Replace the blanket "read all schools" with a cascade-scoped read.
DROP POLICY IF EXISTS "Authenticated can read schools" ON public.bloomberg_schools;
CREATE POLICY "Cascade scoped read schools"
  ON public.bloomberg_schools FOR SELECT
  TO authenticated
  USING (
    public.user_cascade_allows(
      auth.uid(), 'bloomberg_enrolment',
      jsonb_build_object('state', state, 'lga', lga, 'ward', ward, 'location', location, 'school_key', school_key)
    )
  );

-- Assigned users can also read validation records inside their cascade scope
-- (in addition to their own rows). Unassigned users are NOT broadened here.
CREATE POLICY "Cascade scoped read validations"
  ON public.bloomberg_validations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_cascade_assignments
      WHERE user_id = auth.uid() AND form_id = 'bloomberg_enrolment'
    )
    AND public.user_cascade_allows(
      auth.uid(), 'bloomberg_enrolment',
      jsonb_build_object('state', state, 'lga', lga, 'ward', ward, 'school_key', school_key)
    )
  );
