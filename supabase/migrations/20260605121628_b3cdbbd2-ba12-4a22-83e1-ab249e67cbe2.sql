-- ============================================================
-- Clinical infrastructure: facilities, antidepressant stock,
-- stock movements/requests/approvers, and patient referrals
-- ============================================================

CREATE TYPE public.facility_type AS ENUM ('phc', 'secondary', 'tertiary');
CREATE TYPE public.stock_movement_type AS ENUM ('receipt', 'dispense', 'adjustment');
CREATE TYPE public.stock_request_reason AS ENUM ('low', 'out');
CREATE TYPE public.stock_request_status AS ENUM ('pending', 'approved', 'declined', 'fulfilled');
CREATE TYPE public.referral_status AS ENUM ('initiated', 'accepted', 'declined', 'completed');

-- ---------- Health facilities ----------
CREATE TABLE public.health_facilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  name TEXT NOT NULL,
  facility_type public.facility_type NOT NULL DEFAULT 'phc',
  state TEXT,
  lga TEXT,
  ward TEXT,
  address TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_facilities TO authenticated;
GRANT ALL ON public.health_facilities TO service_role;
ALTER TABLE public.health_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view facilities" ON public.health_facilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add facilities" ON public.health_facilities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators or admins can update facilities" ON public.health_facilities
  FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete facilities" ON public.health_facilities
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ---------- Antidepressant stock (current balance per facility/drug) ----------
CREATE TABLE public.antidepressant_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  project_id UUID,
  drug_name TEXT NOT NULL,
  drug_class TEXT NOT NULL DEFAULT 'antidepressant',
  unit TEXT NOT NULL DEFAULT 'tablet',
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, drug_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.antidepressant_stock TO authenticated;
GRANT ALL ON public.antidepressant_stock TO service_role;
ALTER TABLE public.antidepressant_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view stock" ON public.antidepressant_stock
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add stock items" ON public.antidepressant_stock
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated can update stock" ON public.antidepressant_stock
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete stock" ON public.antidepressant_stock
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ---------- Stock movements (receipt / dispense / adjustment) ----------
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.antidepressant_stock(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  movement_type public.stock_movement_type NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  balance_after NUMERIC,
  patient_id TEXT,
  patient_name TEXT,
  notes TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can record movements" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);

-- Auto-deduct / auto-add balance atomically on each movement
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT quantity_on_hand INTO v_balance
  FROM public.antidepressant_stock
  WHERE id = NEW.stock_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Stock item not found';
  END IF;

  IF NEW.movement_type = 'receipt' THEN
    v_balance := v_balance + NEW.quantity;
  ELSE
    -- dispense or adjustment both reduce stock
    v_balance := v_balance - NEW.quantity;
    IF v_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: only % unit(s) available', (v_balance + NEW.quantity);
    END IF;
  END IF;

  UPDATE public.antidepressant_stock
  SET quantity_on_hand = v_balance, updated_at = now()
  WHERE id = NEW.stock_id;

  NEW.balance_after := v_balance;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ---------- Stock approver assignments (with super-admin fallback in app) ----------
CREATE TABLE public.stock_approver_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_id UUID REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_approver_assignments TO authenticated;
GRANT ALL ON public.stock_approver_assignments TO service_role;
ALTER TABLE public.stock_approver_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view approvers" ON public.stock_approver_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage approvers" ON public.stock_approver_assignments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_owner(auth.uid()));

-- ---------- Stock resupply requests ----------
CREATE TABLE public.stock_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES public.antidepressant_stock(id) ON DELETE SET NULL,
  drug_name TEXT NOT NULL,
  quantity_requested NUMERIC NOT NULL CHECK (quantity_requested > 0),
  reason public.stock_request_reason NOT NULL DEFAULT 'low',
  status public.stock_request_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  requested_by UUID,
  approver_id UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_requests TO authenticated;
GRANT ALL ON public.stock_requests TO service_role;
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view stock requests" ON public.stock_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create stock requests" ON public.stock_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Requester or approver can update requests" ON public.stock_requests
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = requested_by
    OR auth.uid() = approver_id
    OR public.is_admin(auth.uid())
    OR public.is_owner(auth.uid())
  );

-- ---------- Patient referrals / transfers ----------
CREATE TABLE public.patient_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  from_facility_id UUID REFERENCES public.health_facilities(id) ON DELETE SET NULL,
  to_facility_id UUID NOT NULL REFERENCES public.health_facilities(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  clinical_summary TEXT,
  urgency TEXT NOT NULL DEFAULT 'routine',
  status public.referral_status NOT NULL DEFAULT 'initiated',
  referred_by UUID,
  accepted_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_referrals TO authenticated;
GRANT ALL ON public.patient_referrals TO service_role;
ALTER TABLE public.patient_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view referrals" ON public.patient_referrals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create referrals" ON public.patient_referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referred_by);
CREATE POLICY "Referrer or admins can update referrals" ON public.patient_referrals
  FOR UPDATE TO authenticated
  USING (auth.uid() = referred_by OR auth.uid() = accepted_by OR public.is_admin(auth.uid()));

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_health_facilities_updated_at
  BEFORE UPDATE ON public.health_facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_antidepressant_stock_updated_at
  BEFORE UPDATE ON public.antidepressant_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stock_requests_updated_at
  BEFORE UPDATE ON public.stock_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_patient_referrals_updated_at
  BEFORE UPDATE ON public.patient_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful indexes
CREATE INDEX idx_stock_movements_facility ON public.stock_movements(facility_id, created_at DESC);
CREATE INDEX idx_stock_requests_status ON public.stock_requests(status, created_at DESC);
CREATE INDEX idx_referrals_to_facility ON public.patient_referrals(to_facility_id, status);
CREATE INDEX idx_facilities_geo ON public.health_facilities(state, lga, ward);