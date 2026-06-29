/// <reference types="google.maps" />
import { supabase } from "@/integrations/supabase/client";

/**
 * Loads the Google Maps JavaScript API exactly once across the whole app.
 * The browser API key is fetched from the `google-maps-key` edge function so
 * it never has to be hardcoded in the bundle.
 */
let googleMapsPromise: Promise<void> | null = null;
let cachedKey: string | null = null;

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
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = "1";
      script.onload = () => resolve();
      script.onerror = () => {
        googleMapsPromise = null;
        reject(new Error("Failed to load Google Maps"));
      };
      document.head.appendChild(script);
    });
  });

  return googleMapsPromise;
}
