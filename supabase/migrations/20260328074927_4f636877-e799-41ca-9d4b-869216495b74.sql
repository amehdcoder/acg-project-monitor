
-- Table for granting non-admin users access to the microplanning entry form
CREATE TABLE public.microplan_form_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.microplan_form_access ENABLE ROW LEVEL SECURITY;

-- Owner can manage all access grants
CREATE POLICY "Owner can manage microplan form access" ON public.microplan_form_access
  FOR ALL TO authenticated
  USING (is_owner(auth.uid()))
  WITH CHECK (is_owner(auth.uid()));

-- Admins with microplanning page access can manage
CREATE POLICY "Granted admins can manage microplan form access" ON public.microplan_form_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_page_access WHERE admin_page_access.user_id = auth.uid() AND admin_page_access.page_id = 'microplanning'))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_page_access WHERE admin_page_access.user_id = auth.uid() AND admin_page_access.page_id = 'microplanning'));

-- Users can see their own access
CREATE POLICY "Users can view own microplan form access" ON public.microplan_form_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- RLS on microplan_entries: Allow granted form users to insert/update/select
CREATE POLICY "Form access users can view microplan entries" ON public.microplan_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM microplan_form_access WHERE microplan_form_access.user_id = auth.uid()));

CREATE POLICY "Form access users can insert microplan entries" ON public.microplan_entries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM microplan_form_access WHERE microplan_form_access.user_id = auth.uid()));

CREATE POLICY "Form access users can update microplan entries" ON public.microplan_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM microplan_form_access WHERE microplan_form_access.user_id = auth.uid()));
