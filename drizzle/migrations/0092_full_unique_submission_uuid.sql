DROP INDEX IF EXISTS public.beneficiaries_submission_uuid_key;
ALTER TABLE public.beneficiaries ADD CONSTRAINT beneficiaries_submission_uuid_key UNIQUE (submission_uuid);
DROP INDEX IF EXISTS public.beneficiary_services_submission_uuid_key;
ALTER TABLE public.beneficiary_services ADD CONSTRAINT beneficiary_services_submission_uuid_key UNIQUE (submission_uuid);
DROP INDEX IF EXISTS public.beneficiary_referrals_submission_uuid_key;
ALTER TABLE public.beneficiary_referrals ADD CONSTRAINT beneficiary_referrals_submission_uuid_key UNIQUE (submission_uuid);