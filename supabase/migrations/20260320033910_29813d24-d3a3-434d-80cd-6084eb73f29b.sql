
CREATE TABLE public.admin_page_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);

ALTER TABLE public.admin_page_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage page access"
ON public.admin_page_access
FOR ALL
TO authenticated
USING (is_owner(auth.uid()))
WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Users can view their own page access"
ON public.admin_page_access
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
