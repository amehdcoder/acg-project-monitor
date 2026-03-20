import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Comprehensive surveillance tracking hook.
 * Tracks: screenshots, SIM changes, external service calls, login locations,
 * app usage, and GDPR compliance events.
 */
export const useSurveillanceTracking = (userId: string | undefined) => {
  const sessionId = useRef(crypto.randomUUID());
  const pageEnteredAt = useRef<number>(Date.now());
  const currentPage = useRef<string>("");

  // Screenshot detection (best-effort)
  useEffect(() => {
    if (!userId) return;

    // Method 1: Keyboard shortcuts (Ctrl+Shift+S, PrintScreen, Cmd+Shift+3/4)
    const handleKeydown = (e: KeyboardEvent) => {
      const isScreenshot =
        e.key === "PrintScreen" ||
        (e.ctrlKey && e.shiftKey && e.key === "S") ||
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5"));

      if (isScreenshot) {
        logSurveillanceEvent("screenshot_attempt", "User attempted to take a screenshot", { method: "keyboard", key: e.key });
      }
    };

    // Method 2: Visibility change (iOS screenshot detection)
    let lastVisibilityChange = 0;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastVisibilityChange = Date.now();
      } else {
        const elapsed = Date.now() - lastVisibilityChange;
        // iOS briefly hides the page during screenshots (~200-500ms)
        if (elapsed > 100 && elapsed < 1000) {
          logSurveillanceEvent("screenshot_possible", "Possible screenshot detected (brief visibility change)", { duration_ms: elapsed });
        }
      }
    };

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId]);

  // SIM change detection (best-effort via Network Information API)
  useEffect(() => {
    if (!userId) return;

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!connection) return;

    // Store initial network type
    const initialType = connection.type;
    const initialEffectiveType = connection.effectiveType;

    const handleNetworkChange = () => {
      // Detect if network type changed significantly (potential SIM swap)
      if (connection.type !== initialType && connection.type === "cellular") {
        logSurveillanceEvent("network_change", `Network changed from ${initialType} to ${connection.type} - possible SIM change`, {
          previous_type: initialType,
          new_type: connection.type,
          effective_type: connection.effectiveType,
        });
      }
    };

    connection.addEventListener("change", handleNetworkChange);
    return () => connection.removeEventListener("change", handleNetworkChange);
  }, [userId]);

  // Track page usage
  const trackPageVisit = useCallback((pageId: string) => {
    if (!userId) return;

    // Log duration of previous page
    if (currentPage.current && currentPage.current !== pageId) {
      const duration = Math.round((Date.now() - pageEnteredAt.current) / 1000);
      supabase.from("app_usage_tracking" as any).insert({
        user_id: userId,
        page_id: currentPage.current,
        action: "page_view",
        session_id: sessionId.current,
        duration_seconds: duration,
      }).then(() => {});
    }

    currentPage.current = pageId;
    pageEnteredAt.current = Date.now();
  }, [userId]);

  // Log external service communication
  const trackExternalService = useCallback((serviceName: string, endpoint: string, success: boolean) => {
    if (!userId) return;
    logSurveillanceEvent("external_service_call", `Communicated with external service: ${serviceName}`, {
      service_name: serviceName,
      endpoint,
      success,
      timestamp: new Date().toISOString(),
    });
  }, [userId]);

  // Log login location
  const trackLoginLocation = useCallback(async () => {
    if (!userId) return;

    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            logSurveillanceEvent("login_location", "User login location captured", {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: new Date().toISOString(),
            });
          },
          () => {
            // GPS denied — log without location
            logSurveillanceEvent("login_location", "Login location unavailable (GPS denied)", {});
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    } catch (e) {
      console.error("Login location tracking failed:", e);
    }
  }, [userId]);

  // Track failed login attempt
  const trackFailedLogin = useCallback(async (email: string, errorMessage: string) => {
    // Get device info
    const ua = navigator.userAgent;
    const deviceInfo = getDeviceInfo(ua);

    await supabase.from("admin_surveillance_log" as any).insert({
      actor_id: "00000000-0000-0000-0000-000000000000",
      actor_email: email,
      actor_role: "unknown",
      action_type: "failed_login",
      action_description: `Failed login attempt: ${errorMessage}`,
      target_entity: "auth",
      target_id: email,
      user_agent: ua,
      metadata: {
        error: errorMessage,
        device: deviceInfo,
        timestamp: new Date().toISOString(),
      },
    });
  }, []);

  const logSurveillanceEvent = async (actionType: string, description: string, metadata: Record<string, unknown>) => {
    if (!userId) return;
    try {
      const deviceInfo = getDeviceInfo(navigator.userAgent);
      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: userId,
        actor_email: "",
        actor_role: "user",
        action_type: actionType,
        action_description: description,
        target_entity: "app",
        user_agent: navigator.userAgent,
        metadata: { ...metadata, device: deviceInfo },
      });
    } catch (e) {
      console.error("Surveillance tracking failed:", e);
    }
  };

  // Cleanup: log final page duration on unmount
  useEffect(() => {
    return () => {
      if (userId && currentPage.current) {
        const duration = Math.round((Date.now() - pageEnteredAt.current) / 1000);
        supabase.from("app_usage_tracking" as any).insert({
          user_id: userId,
          page_id: currentPage.current,
          action: "page_view",
          session_id: sessionId.current,
          duration_seconds: duration,
        }).then(() => {});
      }
    };
  }, [userId]);

  return {
    trackPageVisit,
    trackExternalService,
    trackLoginLocation,
    trackFailedLogin,
    sessionId: sessionId.current,
  };
};

function getDeviceInfo(ua: string) {
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isTablet = /iPad|Tablet|PlayBook/i.test(ua) || (isAndroid && !/Mobile/i.test(ua));
  const isDesktop = !isAndroid && !isIOS && !isTablet;

  // Extract Android version and model
  let androidVersion = "";
  let deviceModel = "";
  if (isAndroid) {
    const avMatch = ua.match(/Android\s+([\d.]+)/);
    if (avMatch) androidVersion = avMatch[1];
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
    if (modelMatch) deviceModel = modelMatch[1].trim();
  }

  // Extract iOS version
  let iosVersion = "";
  if (isIOS) {
    const ivMatch = ua.match(/OS\s+([\d_]+)/);
    if (ivMatch) iosVersion = ivMatch[1].replace(/_/g, ".");
  }

  // Extract browser
  let browser = "Unknown";
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Edge/i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";

  return {
    type: isTablet ? "Tablet/iPad" : isAndroid ? "Android Phone" : isIOS ? "iPhone" : isDesktop ? "Computer" : "Unknown",
    os: isAndroid ? `Android ${androidVersion}` : isIOS ? `iOS ${iosVersion}` : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown",
    browser,
    model: deviceModel || (isIOS ? "Apple Device" : ""),
    user_agent: ua,
  };
}

export default useSurveillanceTracking;
