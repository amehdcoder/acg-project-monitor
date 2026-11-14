ALTER TABLE public.microplan_entries
 ADD COLUMN IF NOT EXISTS cdd_account_name text,
 ADD COLUMN IF NOT EXISTS cdd_account_number text,
 ADD COLUMN IF NOT EXISTS cdd_bank text,
 ADD COLUMN IF NOT EXISTS flhf_account_name text,
 ADD COLUMN IF NOT EXISTS flhf_account_number text,
 ADD COLUMN IF NOT EXISTS flhf_bank text;
ALTER TABLE public.microplan_entries
 ADD CONSTRAINT microplan_cdd_account_number_format CHECK (cdd_account_number IS NULL OR cdd_account_number = '' OR (cdd_account_number ~ '^[0-9]{10}$' AND cdd_account_number <> '0000000000')),
 ADD CONSTRAINT microplan_flhf_account_number_format CHECK (flhf_account_number IS NULL OR flhf_account_number = '' OR (flhf_account_number ~ '^[0-9]{10}$' AND flhf_account_number <> '0000000000')),
 ADD CONSTRAINT microplan_banking_text_limits CHECK (coalesce(length(cdd_account_name),0) <= 150 AND coalesce(length(flhf_account_name),0) <= 150 AND coalesce(length(cdd_bank),0) <= 150 AND coalesce(length(flhf_bank),0) <= 150);
COMMENT ON COLUMN public.microplan_entries.cdd_account_number IS 'Optional Nigerian 10-digit account number stored as text to preserve leading zeros; format validation does not verify ownership.';
COMMENT ON COLUMN public.microplan_entries.flhf_account_number IS 'Optional Nigerian 10-digit facility account number stored as text to preserve leading zeros; format validation does not verify ownership.';