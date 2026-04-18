-- Voice cloning profiles with consent tracking
CREATE TABLE public.voice_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_user_id UUID NOT NULL,
  donor_name TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','approved','declined','revoked')),
  consent_at TIMESTAMP WITH TIME ZONE,
  consent_text TEXT,
  sample_path TEXT,
  sample_duration_ms INTEGER,
  voice_features JSONB,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

-- Owner & super admins can see all
CREATE POLICY "Admins view all voice profiles"
ON public.voice_profiles FOR SELECT
USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()) OR donor_user_id = auth.uid());

-- Only owner can request voice cloning
CREATE POLICY "Owner creates voice requests"
ON public.voice_profiles FOR INSERT
WITH CHECK (public.is_owner(auth.uid()) AND requested_by = auth.uid());

-- Donor can update their own consent + sample; owner can update activation
CREATE POLICY "Donor updates own consent"
ON public.voice_profiles FOR UPDATE
USING (donor_user_id = auth.uid() OR public.is_owner(auth.uid()));

CREATE POLICY "Owner deletes voice profiles"
ON public.voice_profiles FOR DELETE
USING (public.is_owner(auth.uid()) OR donor_user_id = auth.uid());

CREATE TRIGGER update_voice_profiles_updated_at
BEFORE UPDATE ON public.voice_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_voice_profiles_donor ON public.voice_profiles(donor_user_id);
CREATE INDEX idx_voice_profiles_active ON public.voice_profiles(is_active) WHERE is_active = true;

-- Storage bucket for voice samples (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-samples', 'voice-samples', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Donors upload own voice sample"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'voice-samples'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins and donor read voice samples"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voice-samples'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin(auth.uid())
    OR public.is_owner(auth.uid())
  )
);

CREATE POLICY "Donors and owner delete voice samples"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'voice-samples'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_owner(auth.uid())
  )
);