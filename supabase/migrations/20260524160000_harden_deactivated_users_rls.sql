-- Migration: Harden Deactivated Users Access Control
-- Date: 2026-05-24
-- Description: Creates a helper function to check active status and applies a RESTRICTIVE RLS policy on all public schema tables to prevent access/mutations by deactivated users.

-- 1. Create or replace the is_active helper function in public schema
CREATE OR REPLACE FUNCTION public.is_active(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active OR is_owner FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;

-- 2. Dynamically apply RESTRICTIVE policies on all tables in public schema except 'profiles'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name != 'profiles'
    LOOP
        -- Enable RLS just in case it is disabled
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
        
        -- Drop policy if exists
        EXECUTE format('DROP POLICY IF EXISTS "Active users only restriction" ON public.%I;', r.table_name);
        
        -- Create RESTRICTIVE policy to reject all operations (SELECT, INSERT, UPDATE, DELETE) for authenticated users if they are not active
        EXECUTE format(
            'CREATE POLICY "Active users only restriction" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active(auth.uid()));',
            r.table_name
        );
    END LOOP;
END $$;

-- 3. Apply RESTRICTIVE policies specifically for 'profiles' table (allow SELECT so UI loads deactivation state, but block INSERT/UPDATE/DELETE)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active users only profile modification restriction" ON public.profiles;
CREATE POLICY "Active users only profile modification restriction" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));

-- Also block DELETE on profiles for deactivated users
DROP POLICY IF EXISTS "Active users only profile deletion restriction" ON public.profiles;
CREATE POLICY "Active users only profile deletion restriction" ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_active(auth.uid()));

-- 4. Apply RESTRICTIVE policies on storage objects to block read/write of uploaded files
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active users only storage restriction" ON storage.objects;
CREATE POLICY "Active users only storage restriction" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active(auth.uid()));
