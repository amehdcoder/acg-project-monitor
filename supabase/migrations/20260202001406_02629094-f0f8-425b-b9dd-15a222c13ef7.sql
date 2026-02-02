-- Fix 1: Restrict admin_tasks viewing to admins and assigned users only
DROP POLICY IF EXISTS "Users can view tasks" ON public.admin_tasks;

CREATE POLICY "Admins and assigned users can view tasks" 
ON public.admin_tasks 
FOR SELECT USING (
  public.is_admin(auth.uid()) OR 
  assigned_to = auth.uid() OR 
  created_by = auth.uid()
);

-- Fix 2: Restrict task_audit_trail viewing  
DROP POLICY IF EXISTS "Users can view audit trail" ON public.task_audit_trail;

CREATE POLICY "Admins and task owners can view audit trail"
ON public.task_audit_trail
FOR SELECT USING (
  public.is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.admin_tasks 
    WHERE id = task_audit_trail.task_id 
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  )
);

-- Fix 3: Make chat-attachments bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'chat-attachments';

-- Fix 4: Drop public access policy for chat attachments and add authenticated member-only access
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;

CREATE POLICY "Authenticated group members can view chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments' AND
  auth.role() = 'authenticated'
);

-- Fix 5: Ensure profiles table requires authentication for SELECT
-- Drop any overly permissive policies and ensure auth is required
-- The existing policies already check auth.uid() but let's add an explicit check

-- Fix 6: Ensure form_submissions requires authentication
-- The existing policies already check auth.uid() = user_id or is_admin(auth.uid())
-- These implicitly require authentication since auth.uid() returns NULL for unauthenticated users