CREATE TABLE IF NOT EXISTS public.seeclear_kobo_schema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_uid text NOT NULL UNIQUE,
  server_url text NOT NULL DEFAULT 'https://kf.kobotoolbox.org',
  form_title text,
  version_id text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  drift jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  last_error text,
  synced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seeclear_kobo_schema TO authenticated;
GRANT ALL ON public.seeclear_kobo_schema TO service_role;

ALTER TABLE public.seeclear_kobo_schema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read seeclear schema" ON public.seeclear_kobo_schema;
CREATE POLICY "Signed-in users read seeclear schema"
  ON public.seeclear_kobo_schema FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage seeclear schema" ON public.seeclear_kobo_schema;
CREATE POLICY "Admins manage seeclear schema"
  ON public.seeclear_kobo_schema FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())) OR public.is_owner_level((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())) OR public.is_owner_level((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.has_standard_form(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_standard_form_assignments
    WHERE user_id = _user_id AND form_code = _code
  )
$$;

DROP POLICY IF EXISTS "Seeclear grantees read monitoring records" ON public.seeclear_monitoring;
CREATE POLICY "Seeclear grantees read monitoring records"
  ON public.seeclear_monitoring FOR SELECT TO authenticated
  USING (
    public.has_standard_form((SELECT auth.uid()), 'seeclear_dash')
    OR public.has_standard_form((SELECT auth.uid()), 'seeclear_form')
  );

DROP TRIGGER IF EXISTS seeclear_kobo_schema_updated_at ON public.seeclear_kobo_schema;
CREATE TRIGGER seeclear_kobo_schema_updated_at
  BEFORE UPDATE ON public.seeclear_kobo_schema
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.seeclear_kobo_schema REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seeclear_kobo_schema;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;