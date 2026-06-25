DROP TRIGGER IF EXISTS enforce_followup_question_linking_trg ON public.forms;

CREATE OR REPLACE FUNCTION public.enforce_followup_question_linking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Linking follow-up questions to Community Checklist responses is now OPTIONAL
  -- (CommCare-style). This guard is intentionally permissive so admins can save
  -- follow-up modules with plain, unlinked questions.
  RETURN NEW;
END;
$$;