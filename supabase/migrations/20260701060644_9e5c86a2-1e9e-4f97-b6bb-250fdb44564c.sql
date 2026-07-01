-- Allow any admin with access to a form (within its project) — as well as
-- Owners/Co-owners — to edit ALL submissions of that form, not just their own.
-- Editing writes to form_submissions.data, which is already part of the
-- supabase_realtime publication, so linked dashboards update in real time.
CREATE POLICY "Form managers can edit submissions"
ON public.form_submissions
FOR UPDATE
TO authenticated
USING (public.can_manage_form(auth.uid(), form_id))
WITH CHECK (public.can_manage_form(auth.uid(), form_id));

-- Ensure realtime UPDATE payloads carry the full row so dashboards subscribing
-- with column filters receive the edited values.
ALTER TABLE public.form_submissions REPLICA IDENTITY FULL;