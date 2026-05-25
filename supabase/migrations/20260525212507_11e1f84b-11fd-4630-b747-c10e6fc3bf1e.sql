
-- ============ Digital Attendance ============

-- 1. Participants registry
CREATE TABLE public.attendance_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  sex TEXT,
  phone TEXT,
  email TEXT,
  organization TEXT,
  role TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  facility TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  project_id UUID,
  registered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_att_part_name ON public.attendance_participants(full_name);
CREATE INDEX idx_att_part_org ON public.attendance_participants(organization);
CREATE INDEX idx_att_part_project ON public.attendance_participants(project_id);

-- Auto participant code: P00001…
CREATE SEQUENCE IF NOT EXISTS public.attendance_participant_code_seq START 1;

CREATE OR REPLACE FUNCTION public.set_attendance_participant_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.participant_code IS NULL OR NEW.participant_code = '' THEN
    NEW.participant_code := 'P' || LPAD(nextval('public.attendance_participant_code_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_attendance_participant_code
BEFORE INSERT ON public.attendance_participants
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_participant_code();

CREATE TRIGGER trg_att_part_updated_at
BEFORE UPDATE ON public.attendance_participants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read participants" ON public.attendance_participants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert participants" ON public.attendance_participants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update participants" ON public.attendance_participants
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete participants" ON public.attendance_participants
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 2. Sessions
CREATE TABLE public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL UNIQUE,
  activity_name TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'meeting', -- meeting | training | workshop | activity | other
  description TEXT,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  location TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  community TEXT,
  facilitator TEXT,
  expected_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open | submitted | closed | draft
  project_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_att_sess_date ON public.attendance_sessions(session_date DESC);
CREATE INDEX idx_att_sess_project ON public.attendance_sessions(project_id);

CREATE SEQUENCE IF NOT EXISTS public.attendance_session_code_seq START 1;

CREATE OR REPLACE FUNCTION public.set_attendance_session_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
    NEW.session_code := 'S' || LPAD(nextval('public.attendance_session_code_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_attendance_session_code
BEFORE INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_session_code();

CREATE TRIGGER trg_att_sess_updated_at
BEFORE UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sessions" ON public.attendance_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert sessions" ON public.attendance_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update sessions" ON public.attendance_sessions
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete sessions" ON public.attendance_sessions
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 3. Records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.attendance_participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_marked', -- present | absent | late | excused | not_marked
  marked_at TIMESTAMPTZ,
  marked_by UUID,
  remarks TEXT,
  method TEXT, -- manual | qr | signature | self
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, participant_id)
);

CREATE INDEX idx_att_rec_session ON public.attendance_records(session_id);
CREATE INDEX idx_att_rec_participant ON public.attendance_records(participant_id);

CREATE TRIGGER trg_att_rec_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read records" ON public.attendance_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert records" ON public.attendance_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update records" ON public.attendance_records
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete records" ON public.attendance_records
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
