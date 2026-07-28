ALTER TABLE public.microplan_entries
  ALTER COLUMN created_by DROP NOT NULL,
  ALTER COLUMN updated_by DROP NOT NULL;

ALTER TABLE public.microplan_entries
  ALTER COLUMN created_by SET DEFAULT NULL,
  ALTER COLUMN updated_by SET DEFAULT NULL;