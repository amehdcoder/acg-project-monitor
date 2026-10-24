// One-click "fit to device" for the Longitudinal Beneficiary Records.
// Detects the platform and lets text follow the device's own font size setting.
export type DeviceKind = "ios" | "android" | "tablet" | "desktop";
const KEY = "amehnities:lbr-fit";

export function detectDevice(ua = navigator.userAgent, touch = navigator.maxTouchPoints || 0): DeviceKind {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return "tablet";
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "android" : "tablet";
  return "desktop";
}

export const fitEnabled = () => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };

export function applyDeviceFit(on = fitEnabled()) {
  const root = document.documentElement;
  root.dataset.lbrDevice = detectDevice();
  root.dataset.lbrFit = on ? "on" : "off";
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
}
