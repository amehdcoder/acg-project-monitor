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

  let browser = "Unknown Browser";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  return `${type} · ${os} · ${browser}`;
}

/**
 * Periodically updates the current user's `last_seen_at` in profiles
 * so the supervisor dashboard can determine real online/offline status.
 * Also tracks device type and IP address.
 * Skips heartbeat when the session is an impersonation.
 */
export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const ipRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchIp = async () => {
      if (ipRef.current) return ipRef.current;
      try {
        const { data } = await supabase.functions.invoke("get-client-ip");
        if (data?.ip) {
          ipRef.current = data.ip;
          return data.ip;
        }
      } catch {
        // Fallback: try public API
        try {
          const res = await fetch("https://api.ipify.org?format=json");
          const json = await res.json();
          ipRef.current = json.ip;
          return json.ip;
        } catch {
          return null;
        }
      }
      return null;
    };

    const beat = async () => {
      // Don't update heartbeat during impersonation sessions
      if (sessionStorage.getItem(IMPERSONATION_KEY)) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const ip = await fetchIp();
      const deviceType = getDeviceType();
      const deviceDescription = getDeviceDescription();

      const updateData: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        last_device_type: deviceDescription,
        device_info: {
          type: deviceType,
          description: deviceDescription,
          user_agent: navigator.userAgent,
          screen: `${screen.width}x${screen.height}`,
          language: navigator.language,
          platform: navigator.platform,
        },
      };

      if (ip) {
        updateData.last_ip_address = ip;
      }

      await supabase
        .from("profiles")
        .update(updateData as any)
        .eq("user_id", user.id);
    };

    // Fire immediately on mount, then every minute
    beat();
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
