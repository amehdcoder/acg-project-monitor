import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 60_000; // 1 minute
const IMPERSONATION_KEY = "acg_impersonation_admin_session";

/** Detect device type from user agent */
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return "Mobile";
  return "Desktop";
}

/** Get a short device description */
function getDeviceDescription(): string {
  const ua = navigator.userAgent;
  const type = getDeviceType();

  let os = "Unknown OS";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) {
    const match = ua.match(/Android\s([\d.]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const match = ua.match(/OS\s([\d_]+)/);
    os = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  } else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  let browser = "Unknown Browser";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/opr|opera/i.test(ua)) browser = "Opera";
  else if (/brave/i.test(ua)) browser = "Brave";
  else if (/vivaldi/i.test(ua)) browser = "Vivaldi";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/samsung/i.test(ua)) browser = "Samsung Internet";

  return `${type} · ${os} · ${browser}`;
}

/** Fetch client IP with multiple fallback strategies */
async function fetchClientIp(): Promise<string | null> {
  // Strategy 1: Our edge function
  try {
    const { data, error } = await supabase.functions.invoke("get-client-ip");
    if (!error && data?.ip && data.ip !== "unknown") {
      return data.ip;
    }
  } catch {
    // continue to fallbacks
  }

  // Strategy 2: ipify
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      if (json.ip) return json.ip;
    }
  } catch {
    // continue
  }

  // Strategy 3: ipapi
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      if (json.ip) return json.ip;
    }
  } catch {
    // continue
  }

  // Strategy 4: cloudflare trace
  try {
    const res = await fetch("https://1.1.1.1/cdn-cgi/trace", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/ip=(.+)/);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // all strategies failed
  }

  return null;
}

/** Parse browser from UA */
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return "Edge";
  if (/opr|opera/i.test(ua)) return "Opera";
  if (/brave/i.test(ua)) return "Brave";
  if (/vivaldi/i.test(ua)) return "Vivaldi";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/samsung/i.test(ua)) return "Samsung Internet";
  return "Unknown";
}

/** Parse OS from UA */
function getOS(): string {
  const ua = navigator.userAgent;
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/);
    return m ? `Android ${m[1]}` : "Android";
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    const m = ua.match(/OS\s([\d_]+)/);
    return m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  }
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown";
}

/** Generate a fingerprint for the current device session */
function getDeviceFingerprint(): string {
  return `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.language}`;
}

/**
 * Periodically updates the current user's `last_seen_at` in profiles
 * so the supervisor dashboard can determine real online/offline status.
 * Also tracks device type and IP address + device sessions.
 * Skips heartbeat when the session is an impersonation.
 */
export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const cachedIpRef = useRef<string | null>(null);
  const sessionRecordedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      // Don't update heartbeat during impersonation sessions
      if (sessionStorage.getItem(IMPERSONATION_KEY)) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const deviceType = getDeviceType();
        const deviceDescription = getDeviceDescription();
        const browser = getBrowser();
        const os = getOS();
        const screenRes = `${screen.width}x${screen.height}`;

        // Always update device info and last_seen_at first (don't wait for IP)
        const updateData: Record<string, unknown> = {
          last_seen_at: new Date().toISOString(),
          last_device_type: deviceDescription,
          device_info: {
            type: deviceType,
            description: deviceDescription,
            user_agent: navigator.userAgent,
            screen: screenRes,
            language: navigator.language,
            platform: navigator.platform,
            online: navigator.onLine,
          },
        };

        // Use cached IP if available, or fetch new one
        if (cachedIpRef.current) {
          updateData.last_ip_address = cachedIpRef.current;
        }

        // Update profile with device info immediately
        const { error: updateError } = await supabase
          .from("profiles")
          .update(updateData as any)
          .eq("user_id", user.id);

        if (updateError) {
          console.warn("[Heartbeat] Profile update failed:", updateError.message);
        }

        // Fetch IP in background if not cached, then update separately
        if (!cachedIpRef.current && !cancelled) {
          const ip = await fetchClientIp();
          if (ip && !cancelled) {
            cachedIpRef.current = ip;
            await supabase
              .from("profiles")
              .update({ last_ip_address: ip } as any)
              .eq("user_id", user.id);
          }
        }

        // Record / update device session
        if (!sessionRecordedRef.current && !cancelled) {
          sessionRecordedRef.current = true;
          const fingerprint = getDeviceFingerprint();
          // Check if there's an existing active session for this fingerprint
          const { data: existing } = await supabase
            .from("device_sessions" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("device_description", deviceDescription)
            .eq("is_active", true)
            .maybeSingle();

          if (existing) {
            // Update last_seen_at on existing session
            await supabase
              .from("device_sessions" as any)
              .update({
                last_seen_at: new Date().toISOString(),
                ip_address: cachedIpRef.current || null,
              })
              .eq("id", (existing as any).id);
          } else {
            // Insert new session
            await supabase.from("device_sessions" as any).insert({
              user_id: user.id,
              session_id: fingerprint,
              device_type: deviceType,
              device_description: deviceDescription,
              ip_address: cachedIpRef.current || null,
              user_agent: navigator.userAgent,
              browser,
              os,
              screen_resolution: screenRes,
              is_active: true,
            });
          }
        } else if (sessionRecordedRef.current && !cancelled) {
          // Periodically update last_seen_at on session record (every heartbeat)
          await supabase
            .from("device_sessions" as any)
            .update({
              last_seen_at: new Date().toISOString(),
              ip_address: cachedIpRef.current || null,
            })
            .eq("user_id", user.id)
            .eq("device_description", getDeviceDescription())
            .eq("is_active", true);
        }

        // Refresh IP every 10 minutes (every 10th heartbeat)
        if (cachedIpRef.current) {
          const now = Date.now();
          if (!beat._lastIpRefresh || now - beat._lastIpRefresh > 600_000) {
            beat._lastIpRefresh = now;
            fetchClientIp().then((ip) => {
              if (ip) cachedIpRef.current = ip;
            });
          }
        }
      } catch (err) {
        console.warn("[Heartbeat] Error:", err);
      }
    };
    beat._lastIpRefresh = 0 as number;

    // Fire immediately on mount, then every minute
    beat();
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
