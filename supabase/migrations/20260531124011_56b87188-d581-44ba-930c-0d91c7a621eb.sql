CREATE OR REPLACE FUNCTION public.has_field_designation(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND lower(designation::text) IN ('enumerator', 'community_directed_distributor', 'flhf_supervisor')
  )
$$;

CREATE POLICY "Field designations can view microplan entries"
ON public.microplan_entries FOR SELECT
USING (public.has_field_designation(auth.uid()));

CREATE POLICY "Field designations can insert microplan entries"
ON public.microplan_entries FOR INSERT
WITH CHECK (public.has_field_designation(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Field designations can update own microplan entries"
ON public.microplan_entries FOR UPDATE
USING (public.has_field_designation(auth.uid()) AND created_by = auth.uid());