
-- Add follow_up_schedule to case_types (stores frequency config)
ALTER TABLE public.case_types ADD COLUMN IF NOT EXISTS follow_up_schedule jsonb DEFAULT NULL;

-- Add next_follow_up_date to cases for tracking when follow-up is due
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS next_follow_up_date timestamp with time zone DEFAULT NULL;
