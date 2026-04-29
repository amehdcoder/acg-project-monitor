ALTER TABLE public.microplan_entries
ADD COLUMN IF NOT EXISTS medicine_used numeric NULL,
ADD COLUMN IF NOT EXISTS medicine_reversed_to text NULL,
ADD COLUMN IF NOT EXISTS medicine_reversed_other text NULL;