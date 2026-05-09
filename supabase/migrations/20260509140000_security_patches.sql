
-- Security Hardening Migration
-- Date: 2026-05-09
-- Description: Fixes multiple RLS vulnerabilities and data exposure issues.

-- 1. Restrict 'submission_versions' access
DROP POLICY IF EXISTS "Authenticated users can view submission versions" ON public.submission_versions;
CREATE POLICY "Users can view relevant submission versions"
  ON public.submission_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.form_submissions s
      WHERE s.id = submission_versions.submission_id
      AND (
        s.user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.user_project_assignments upa WHERE upa.project_id = s.project_id AND upa.user_id = auth.uid()) OR
        public.is_admin(auth.uid())
      )
    )
  );

-- 2. Secure 'quiz_questions' by masking correct_answer
CREATE OR REPLACE VIEW public.quiz_questions_secure AS
SELECT 
    id, 
    quiz_id, 
    question_text, 
    question_type, 
    options, 
    points, 
    sort_order, 
    created_at,
    CASE 
        WHEN public.is_admin(auth.uid()) THEN correct_answer 
        ELSE NULL 
    END as correct_answer
FROM public.quiz_questions;

-- Ensure RLS on base table remains but is more restrictive if needed
-- (Current policy allows viewing rows, but the View will mask the column)
GRANT SELECT ON public.quiz_questions_secure TO authenticated;

-- 3. Restrict 'ces_households' updates
DROP POLICY IF EXISTS "Authenticated can update CES households" ON public.ces_households;
CREATE POLICY "Authorized can update CES households"
  ON public.ces_households
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.user_project_assignments upa
      WHERE upa.project_id = ces_households.project_id
      AND upa.user_id = auth.uid()
    ) OR
    public.is_admin(auth.uid())
  );

-- 4. Harden 'user_roles' management (Admins only)
-- Drop loose permissive policies
DROP POLICY IF EXISTS "Owner protection on role changes" ON public.user_roles;
DROP POLICY IF EXISTS "Owner protection on role deletion" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;

-- Create restrictive policies to block non-admins
CREATE POLICY "Restrictive admin role management"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Re-add permissive policy for admins to actually perform the action
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Restrict 'ces_keyframes' inserts to session owners
DROP POLICY IF EXISTS "Authenticated can insert CES keyframes" ON public.ces_keyframes;
CREATE POLICY "Session owners can insert keyframes"
  ON public.ces_keyframes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ces_capture_sessions s
      WHERE s.id = ces_keyframes.session_id
      AND s.created_by = auth.uid()
    )
  );

-- 6. Restrict 'chat-attachments' storage access to group members
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;
CREATE POLICY "Group members can view chat attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.chat_group_id::text = (storage.foldername(name))[1]
      AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Group members can upload chat attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.chat_group_id::text = (storage.foldername(name))[1]
      AND m.user_id = auth.uid()
    )
  );


-- 7. Topic-scoped Realtime policies (assuming realtime schema exists)
-- This is a generic fix for common realtime.messages vulnerability
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
        DROP POLICY IF EXISTS "Anyone can listen to realtime" ON realtime.messages;
        CREATE POLICY "Topic-scoped realtime access"
          ON realtime.messages
          FOR ALL
          TO authenticated
          USING (
            topic = 'user:' || auth.uid()::text OR
            topic LIKE 'group:%' AND EXISTS (
                SELECT 1 FROM public.chat_group_members m 
                WHERE m.chat_group_id::text = split_part(topic, ':', 2)
                AND m.user_id = auth.uid()
            ) OR
            public.is_admin(auth.uid())
          );
    END IF;
END $$;

-- 8. Add missing INSERT policy for 'microplan_allocation_history'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'microplan_allocation_history' AND cmd = 'INSERT'
    ) THEN
        CREATE POLICY "Admins can insert allocation history"
          ON public.microplan_allocation_history
          FOR INSERT
          TO authenticated
          WITH CHECK (public.is_admin(auth.uid()));
    END IF;
END $$;
