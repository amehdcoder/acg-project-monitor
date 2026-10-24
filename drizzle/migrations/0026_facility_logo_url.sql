ALTER TABLE public.health_facilities ADD COLUMN IF NOT EXISTS logo_url TEXT;
COMMENT ON COLUMN public.health_facilities.logo_url IS 'Public URL of the facility logo shown on beneficiary hand cards in place of the default partner logo.';

-- Storage policies for the facility-logos bucket (bucket created via storage tool)
CREATE POLICY "Public read facility logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'facility-logos');

CREATE POLICY "Authenticated upload facility logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'facility-logos');

CREATE POLICY "Authenticated update facility logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'facility-logos')
WITH CHECK (bucket_id = 'facility-logos');

CREATE POLICY "Authenticated delete facility logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'facility-logos');