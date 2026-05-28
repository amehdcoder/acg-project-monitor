GRANT SELECT, INSERT, UPDATE, DELETE ON public.ces_role_assignments TO authenticated;
GRANT ALL ON public.ces_role_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ces_peer_validations TO authenticated;
GRANT ALL ON public.ces_peer_validations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ces_fenced_communities TO authenticated;
GRANT ALL ON public.ces_fenced_communities TO service_role;

CREATE OR REPLACE FUNCTION public.can_peer_validate_survey(_user_id uuid, _survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.ces_surveys s
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