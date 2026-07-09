-- =========================================================================
-- Finding 1: case_types_public_role
-- Retarget all case-management policies from role 'public' to 'authenticated'.
-- Quals/with_check already require auth.uid(); ALTER POLICY preserves them.
-- =========================================================================
ALTER POLICY "Users can create activities for accessible cases" ON public.case_activities TO authenticated;
ALTER POLICY "Users can view activities for cases they can access" ON public.case_activities TO authenticated;
ALTER POLICY "Access attachments for accessible cases" ON public.case_attachments TO authenticated;
ALTER POLICY "Access notes for accessible cases" ON public.case_notes TO authenticated;
ALTER POLICY "Manage case permissions for accessible cases" ON public.case_permissions TO authenticated;
ALTER POLICY "View case permissions for accessible cases" ON public.case_permissions TO authenticated;
ALTER POLICY "Access referrals for accessible cases" ON public.case_referrals TO authenticated;
ALTER POLICY "Access relationships for accessible cases" ON public.case_relationships TO authenticated;
ALTER POLICY "Insert status history for accessible cases" ON public.case_status_history TO authenticated;
ALTER POLICY "View status history for accessible cases" ON public.case_status_history TO authenticated;
ALTER POLICY "Access tasks for accessible cases" ON public.case_tasks TO authenticated;
ALTER POLICY "Admins can create case types" ON public.case_types TO authenticated;
ALTER POLICY "Admins can delete case types" ON public.case_types TO authenticated;
ALTER POLICY "Admins can update case types" ON public.case_types TO authenticated;
ALTER POLICY "Users can view case types in their assigned projects" ON public.case_types TO authenticated;
ALTER POLICY "Admins can delete cases" ON public.cases TO authenticated;
ALTER POLICY "Users can create cases in assigned projects" ON public.cases TO authenticated;
ALTER POLICY "Users can update their own cases or admins can update any" ON public.cases TO authenticated;
ALTER POLICY "Users can view cases they own or in assigned projects" ON public.cases TO authenticated;

-- =========================================================================
-- Finding 2: chat_attachments_url_matching_bypass
-- Replace fragile LIKE ('%' || name) with an exact object-path comparison.
-- =========================================================================
ALTER POLICY "Chat attachment access scoped to group members" ON storage.objects
USING (
  (bucket_id = 'chat-attachments'::text) AND (
    ((auth.uid())::text = (storage.foldername(name))[1])
    OR is_admin(auth.uid())
    OR (EXISTS (
      SELECT 1
      FROM chat_messages m
      JOIN chat_group_members gm
        ON gm.chat_group_id = m.chat_group_id AND gm.user_id = auth.uid()
      WHERE split_part(m.attachment_url, '/chat-attachments/', 2) = objects.name
    ))
  )
);

-- =========================================================================
-- Finding 3: inactive_login_attempts_public_insert
-- Remove arbitrary public INSERT; route writes through a validated
-- SECURITY DEFINER RPC that trims/validates the data.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_inactive_login_attempt(
  _email text,
  _reason text,
  _mode text DEFAULT 'online',
  _attempted_user_id uuid DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _created_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_mode text;
  v_meta jsonb;
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 OR length(_email) > 320 THEN
    RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023';
  END IF;

  v_mode := CASE WHEN _mode IN ('online','offline') THEN _mode ELSE 'online' END;

  -- Cap metadata size to prevent flooding with large payloads.
  v_meta := COALESCE(_metadata, '{}'::jsonb);
  IF length(v_meta::text) > 4000 THEN
    v_meta := jsonb_build_object('truncated', true);
  END IF;

  INSERT INTO public.inactive_login_attempts
    (email, attempted_user_id, reason, mode, user_agent, metadata, created_at)
  VALUES (
    lower(left(trim(_email), 320)),
    _attempted_user_id,
    left(COALESCE(NULLIF(trim(_reason), ''), 'unknown'), 64),
    v_mode,
    left(COALESCE(_user_agent, ''), 1000),
    v_meta,
    COALESCE(_created_at, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inactive_login_attempt(text,text,text,uuid,text,jsonb,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.record_inactive_login_attempt(text,text,text,uuid,text,jsonb,timestamptz) TO anon, authenticated;

-- Remove the permissive direct-insert path.
DROP POLICY IF EXISTS "Anyone can record inactive login attempts" ON public.inactive_login_attempts;
REVOKE INSERT ON public.inactive_login_attempts FROM anon;

-- =========================================================================
-- Finding 4: witness_logs_anon_insert
-- Drop the permissive anon/authenticated direct INSERT policy. All inserts
-- already flow through the validated SECURITY DEFINER RPC
-- submit_witness_verification (which bypasses RLS as definer).
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can submit witness verification" ON public.ces_witness_logs;

-- =========================================================================
-- Finding 5: realtime_no_rls_check_for_published_tables
-- SELECT policies are already scoped by auth.uid()/admin/project membership.
-- Tighten the two remaining 'public'-role SELECT policies to 'authenticated'
-- so anonymous realtime subscribers are never evaluated against them.
-- =========================================================================
ALTER POLICY "Creator, project members or admins view ACSM reports" ON public.acsm_reports TO authenticated;
ALTER POLICY "Creator, project members or admins view IRF reports" ON public.irf_reports TO authenticated;
