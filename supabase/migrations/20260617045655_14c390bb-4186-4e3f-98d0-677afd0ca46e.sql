ALTER TABLE public.bloomberg_validations
  ADD COLUMN IF NOT EXISTS specified_locations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bloomberg_validations.specified_locations IS
  'User-typed values for School Information fields whose cascade option was "Not Specified in the LGA School Enrolment Dataset". Keys: state, lga, ward, location, school.';