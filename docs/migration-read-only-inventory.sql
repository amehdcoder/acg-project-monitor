-- READ ONLY. Run through an authorized administrator connection to EACH backend.
-- Do not change the live app's connection to obtain the destination results.
-- Output contains aggregate counts/schema metadata, not accounts or record contents.
-- Missing tables or denied access are UNKNOWN, never zero. Share results securely.
-- Counts are a baseline, NOT a full backup or proof that the records are identical.

-- 1. Check table availability before the exact-count query below.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Exact counts: execute only when these tables exist and access is authorized.
-- One statement gives the counts a common snapshot within this backend.
SELECT jsonb_build_object(
  'observed_at_utc', now(),
  'public_table_count', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
  'user_account_count', (SELECT count(*) FROM auth.users),
  'profiles', (SELECT count(*) FROM public.profiles),
  'projects', (SELECT count(*) FROM public.projects),
  'beneficiaries', (SELECT count(*) FROM public.beneficiaries),
  'microplan_entries', (SELECT count(*) FROM public.microplan_entries),
  'eye_daily_reports', (SELECT count(*) FROM public.eye_daily_reports),
  'eye_daily_patients', (SELECT count(*) FROM public.eye_daily_patients),
  'forms', (SELECT count(*) FROM public.forms),
  'form_submissions', (SELECT count(*) FROM public.form_submissions),
  'kobo_form_configs', (SELECT count(*) FROM public.kobo_form_configs),
  'storage_buckets', (SELECT count(*) FROM storage.buckets),
  'storage_objects', (SELECT count(*) FROM storage.objects)
) AS inventory;

-- 3. File inventory uses size METADATA; it does not retrieve or verify file bytes.
SELECT b.id AS bucket, b.public, count(o.id) AS object_count,
  coalesce(sum(CASE WHEN o.metadata->>'size' ~ '^[0-9]+$'
    THEN (o.metadata->>'size')::numeric ELSE 0 END),0) AS metadata_bytes,
  count(o.id) FILTER (WHERE o.metadata->>'size' IS NULL
    OR NOT (o.metadata->>'size' ~ '^[0-9]+$')) AS objects_without_numeric_size
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id
GROUP BY b.id,b.public ORDER BY b.id;

-- 4. Account consistency; no names, emails, passwords or user identifiers returned.
SELECT
  (SELECT count(*) FROM auth.users u WHERE NOT EXISTS
    (SELECT 1 FROM public.profiles p WHERE p.user_id=u.id)) AS accounts_without_profile,
  (SELECT count(*) FROM public.profiles p WHERE p.user_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM auth.users u WHERE u.id=p.user_id)) AS profiles_without_account,
  (SELECT count(*) FROM public.profiles WHERE user_id IS NULL) AS profiles_without_user_id,
  (SELECT count(*) FROM (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING count(*)>1) d) AS duplicated_profile_user_ids;

-- 5. Column and access-policy inventory; does not expose definitions or secrets.
-- Matching these results still does not prove functions, grants or constraints match.
SELECT table_name, ordinal_position, column_name, data_type,
  udt_schema, udt_name, is_nullable
FROM information_schema.columns WHERE table_schema='public'
ORDER BY table_name,ordinal_position;

SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;