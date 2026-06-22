DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bloomberg_validations_status'
      AND conrelid = 'public.bloomberg_validations'::regclass
  ) THEN
    ALTER TABLE public.bloomberg_validations
      ADD CONSTRAINT chk_bloomberg_validations_status
      CHECK (status IN ('draft', 'sent', 'submitted', 'finalized'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_validator_id
  ON public.bloomberg_validations (validator_id);

CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_validator_status
  ON public.bloomberg_validations (validator_id, status)
  WHERE status <> 'draft';

CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_validator_school_visit
  ON public.bloomberg_validations (validator_id, school_key, ((verification->>'date_of_visit')))
  WHERE school_key IS NOT NULL AND status <> 'draft';

CREATE INDEX IF NOT EXISTS idx_bloomberg_validations_state_lga
  ON public.bloomberg_validations (state, lga);

CREATE INDEX IF NOT EXISTS idx_field_activity_user_id_started
  ON public.field_activity (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_activity_form_started
  ON public.field_activity (form_id, started_at DESC);

ALTER TABLE public.field_activity REPLICA IDENTITY FULL;