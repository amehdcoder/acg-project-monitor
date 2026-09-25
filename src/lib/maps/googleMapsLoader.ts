/// <reference types="google.maps" />
import { supabase } from "@/integrations/supabase/client";

/**
 * Loads the Google Maps JavaScript API exactly once across the whole app.
 * The browser API key is fetched from the `google-maps-key` edge function so
 * it never has to be hardcoded in the bundle.
 */
let googleMapsPromise: Promise<void> | null = null;
let cachedKey: string | null = null;
const GOOGLE_MAPS_READY_CALLBACK = "__amehnitiesGoogleMapsReady";

/**
 * Set to true when Google rejects the API key (billing disabled, referrer not
 * allowed, API not enabled, etc). Google invokes `window.gm_authFailure` in
 * these cases. Consumers (e.g. Street View panel) read this to fall back to
 * Mapillary imagery instead of showing Google's broken "development only"
 * overlay.
 */
export let googleMapsAuthFailed = false;

export const GOOGLE_MAPS_AUTH_FAILED_EVENT = "google-maps-auth-failed";

if (typeof window !== "undefined") {
  // Google calls this global on any key/billing/referrer auth failure.
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    googleMapsAuthFailed = true;
    window.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILED_EVENT));
  };
}

async function fetchKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  try {
    const { data, error } = await supabase.functions.invoke("google-maps-key");
    if (error) throw error;
    const key = (data as { key?: string } | null)?.key;
    if (key) {
      cachedKey = key;
      return key;
    }
  } catch (e) {
    console.warn("google-maps-key fetch failed", e);
  }
  return "";
}

export function loadGoogleMaps(): Promise<void> {
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.maps?.StreetViewPanorama) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-loader="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => {
        googleMapsPromise = null;
        reject(new Error("Failed to load Google Maps"));
      });
      return;
    }

    fetchKey().then((key) => {
      if (!key) {
        googleMapsPromise = null;
        reject(new Error("Google Maps API key unavailable"));
        return;
      }
      const callbackHost = window as unknown as Record<string, unknown>;
      const script = document.createElement("script");
      callbackHost[GOOGLE_MAPS_READY_CALLBACK] = () => {
        delete callbackHost[GOOGLE_MAPS_READY_CALLBACK];
        resolve();
      };
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${GOOGLE_MAPS_READY_CALLBACK}`;
      script.async = true;
      script.dataset.googleMapsLoader = "1";
      script.onerror = () => {
        delete callbackHost[GOOGLE_MAPS_READY_CALLBACK];
        googleMapsPromise = null;
        reject(new Error("Failed to load Google Maps"));
      };
      document.head.appendChild(script);
    });
  });

  return googleMapsPromise;
}
