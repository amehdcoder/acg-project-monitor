import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY =
  "BDA8NeZl-6i3ifTaiojQeIiD3pBSLjc8WN3mUHAEuWan7heYKPdiA_cEi-NYsLBDREGqjRvIz4LxX9SU8fEyYyI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    window.self !== window.top ||
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com") ||
    h.endsWith(".beta.lovable.dev")
  );
}

/**
 * Subscribes the signed-in user to Web Push so they receive chat message
 * pop-ups even when the app is closed (browser/PWA must be installed/allowed).
 * No-op in dev/preview, on unsupported browsers, or when permission is denied.
 */
export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (isPreviewHost()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!("Notification" in window)) return;

    let cancelled = false;

    const run = async () => {
      try {
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;

        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          });
        }
        if (cancelled || !sub) return;

        const json = sub.toJSON();
        if (!json.keys?.p256dh || !json.keys?.auth || !json.endpoint) return;

        await supabase.from("push_subscriptions").upsert(
          {
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent.slice(0, 255),
          },
          { onConflict: "endpoint" },
        );
      } catch (err) {
        console.warn("[push] subscription skipped:", err);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);
}
