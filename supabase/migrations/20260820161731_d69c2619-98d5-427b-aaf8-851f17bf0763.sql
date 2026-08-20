-- 1) device_sessions: constrain admin updates to revocation-only fields
CREATE OR REPLACE FUNCTION public.guard_device_session_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owners may maintain their own session heartbeat rows freely.
  IF OLD.user_id = auth.uid() THEN
    IF NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'Session ownership cannot be transferred';
    END IF;
    RETURN NEW;
  END IF;

  -- Everyone else (admins/co-owners) may only revoke/deactivate a session.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.device_type IS DISTINCT FROM OLD.device_type
     OR NEW.device_description IS DISTINCT FROM OLD.device_description
     OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.browser IS DISTINCT FROM OLD.browser
     OR NEW.os IS DISTINCT FROM OLD.os
     OR NEW.screen_resolution IS DISTINCT FROM OLD.screen_resolution
     OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Admins may only revoke or deactivate device sessions';
  END IF;

  IF NEW.revoked_by IS NOT NULL AND NEW.revoked_by <> auth.uid() THEN
    RAISE EXCEPTION 'revoked_by must reference the acting administrator';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_device_session_admin_update ON public.device_sessions;
CREATE TRIGGER guard_device_session_admin_update
BEFORE UPDATE ON public.device_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_device_session_admin_update();

DROP POLICY IF EXISTS "Admins can update any session" ON public.device_sessions;
CREATE POLICY "Admins can revoke any session"
ON public.device_sessions
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (
  is_admin(auth.uid())
  AND (revoked_by IS NULL OR revoked_by = auth.uid())
);

-- 2) proximity_presence: only broadcast coordinates to genuinely nearby peers
CREATE OR REPLACE FUNCTION public.is_within_proximity_radius(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proximity_presence v
    JOIN public.proximity_presence t ON t.user_id = _target
    WHERE v.user_id = _viewer
      AND v.enabled = true
      AND t.enabled = true
      AND v.lat IS NOT NULL AND v.lng IS NOT NULL
      AND t.lat IS NOT NULL AND t.lng IS NOT NULL
      AND v.updated_at > now() - interval '30 minutes'
      AND t.updated_at > now() - interval '30 minutes'
      -- Haversine distance in metres, capped at a 2 km discovery radius
      AND (
        6371000 * 2 * asin(
          sqrt(
            power(sin(radians(t.lat - v.lat) / 2), 2)
            + cos(radians(v.lat)) * cos(radians(t.lat))
              * power(sin(radians(t.lng - v.lng) / 2), 2)
          )
        )
      ) <= 2000
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_proximity_conversation(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proximity_conversations c
    WHERE (c.user_a = _viewer AND c.user_b = _target)
       OR (c.user_a = _target AND c.user_b = _viewer)
  );
$$;

DROP POLICY IF EXISTS "Participants read enabled proximity presence" ON public.proximity_presence;
CREATE POLICY "Nearby or matched participants read proximity presence"
ON public.proximity_presence
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    enabled = true
    AND is_proximity_participant(auth.uid())
    AND shares_project_with(auth.uid(), user_id)
    AND (
      public.is_within_proximity_radius(auth.uid(), user_id)
      OR public.shares_proximity_conversation(auth.uid(), user_id)
    )
  )
);