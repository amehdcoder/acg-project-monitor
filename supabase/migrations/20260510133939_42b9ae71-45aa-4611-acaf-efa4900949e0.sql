-- Audit trail for peer validation note edits
CREATE TABLE public.ces_peer_validation_note_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id uuid NOT NULL,
  edited_by uuid NOT NULL,
  previous_notes text,
  new_notes text,
  edited_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv_note_audits_validation ON public.ces_peer_validation_note_audits(validation_id, edited_at DESC);

ALTER TABLE public.ces_peer_validation_note_audits ENABLE ROW LEVEL SECURITY;

-- Editor (validator who owns the validation) or admin can view audit entries
CREATE POLICY "pv_note_audit: validator/creator/admin read"
ON public.ces_peer_validation_note_audits FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.ces_peer_validations pv
    WHERE pv.id = ces_peer_validation_note_audits.validation_id
      AND (pv.validator_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.ces_surveys s
                      WHERE s.id = pv.survey_id AND s.created_by = auth.uid()))
  )
);

-- Only the validation's owner (validator) or admin can insert audit rows
CREATE POLICY "pv_note_audit: validator or admin insert"
ON public.ces_peer_validation_note_audits FOR INSERT
TO authenticated
WITH CHECK (
  edited_by = auth.uid()
  AND (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ces_peer_validations pv
      WHERE pv.id = ces_peer_validation_note_audits.validation_id
        AND pv.validator_id = auth.uid()
    )
  )
);
