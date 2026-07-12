ALTER TABLE public.dashboard_shares
  ADD COLUMN form_id uuid,
  ADD COLUMN form_name text,
  ADD COLUMN form_snapshot jsonb;